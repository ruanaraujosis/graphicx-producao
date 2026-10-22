"use client";

import { CalendarClock, Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { CHANNELS } from "@/components/kit/channel-badge";
import { SearchPicker, type PickerOption } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SALES_CHANNELS, roundCents, type SalesChannel } from "@/lib/catalog/pricing";
import { formatPhone } from "@/lib/documents";
import { formatCurrency } from "@/lib/format";
import { parseDecimal } from "@/lib/form-schemas";
import { addBusinessDays, formatDueDate, todayIso } from "@/lib/orders/deadline";
import { saveOrder, searchCustomers } from "./actions";
import { NewCustomerButton } from "./new-customer";
import type { PaymentOption, VariantOption } from "./data";
import { orderSchema } from "./schema";

type Row = {
  key: string;
  id: string | null;
  variant_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  /** Preço digitado à mão: não muda quando o canal muda. */
  priceEdited: boolean;
  /** Item baixado do estoque: não pode mudar quantidade nem produto. */
  locked?: boolean;
};

export type OrderFormInitial = {
  id: string;
  channel: SalesChannel;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  needs_art: boolean;
  due_date: string | null;
  payment_method_id: string | null;
  discount: number;
  shipping: number;
  notes: string | null;
  items: {
    id: string;
    variant_id: string | null;
    description: string;
    quantity: number;
    unit_price: number;
    locked: boolean;
  }[];
};

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const money = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: string) => {
  const n = parseDecimal(v);
  return n === undefined || Number.isNaN(n) ? 0 : n;
};

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

export function OrderForm({
  variants,
  payments,
  initial,
}: {
  variants: readonly VariantOption[];
  payments: readonly PaymentOption[];
  initial?: OrderFormInitial;
}) {
  const router = useRouter();
  const ids = useId();
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);

  const [channel, setChannel] = useState<SalesChannel>(initial?.channel ?? "balcao");
  const [customerId, setCustomerId] = useState<string | null>(initial?.customer_id ?? null);
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(formatPhone(initial?.customer_phone ?? ""));
  const [needsArt, setNeedsArt] = useState(initial?.needs_art ?? true);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [dueTouched, setDueTouched] = useState(Boolean(initial));
  const [paymentId, setPaymentId] = useState(initial?.payment_method_id ?? "__none");
  const [discount, setDiscount] = useState(initial ? money(initial.discount) : "0,00");
  const [shipping, setShipping] = useState(initial ? money(initial.shipping) : "0,00");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [asQuote, setAsQuote] = useState(false);
  const [rows, setRows] = useState<Row[]>(
    initial?.items.map((i) => ({
      key: newKey(),
      id: i.id,
      variant_id: i.variant_id,
      description: i.description,
      quantity: br(i.quantity),
      unit_price: money(i.unit_price),
      priceEdited: true,
      locked: i.locked,
    })) ?? [],
  );
  const [productQuery, setProductQuery] = useState("");

  const subtotal = roundCents(rows.reduce((s, r) => s + num(r.quantity) * num(r.unit_price), 0));
  const total = roundCents(subtotal - num(discount) + num(shipping));
  const maxDays = Math.max(
    0,
    ...rows.map((r) => (r.variant_id ? (byId.get(r.variant_id)?.productionDays ?? 0) : 0)),
  );
  const suggestedDue = rows.length ? addBusinessDays(todayIso(), maxDays) : null;

  function update(key: string, patch: Partial<Row>) {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addVariant(option: PickerOption) {
    const v = byId.get(option.value);
    if (!v) return;
    setRows((list) => [
      ...list,
      {
        key: newKey(),
        id: null,
        variant_id: v.id,
        description: v.label,
        quantity: "1",
        unit_price: money(v.prices[channel]),
        priceEdited: false,
      },
    ]);
    setProductQuery("");
    if (!dueTouched) {
      const days = Math.max(maxDays, v.productionDays);
      setDueDate(addBusinessDays(todayIso(), days));
    }
  }

  function addCustom() {
    setRows((list) => [
      ...list,
      {
        key: newKey(),
        id: null,
        variant_id: null,
        description: "",
        quantity: "1",
        unit_price: "0,00",
        priceEdited: true,
      },
    ]);
  }

  function changeChannel(next: SalesChannel) {
    setChannel(next);
    // Itens com preço automático acompanham o canal.
    setRows((list) =>
      list.map((r) => {
        const v = r.variant_id ? byId.get(r.variant_id) : undefined;
        return v && !r.priceEdited ? { ...r, unit_price: money(v.prices[next]) } : r;
      }),
    );
  }

  function searchVariants(q: string): PickerOption[] {
    const term = q.trim().toLowerCase();
    return variants
      .filter((v) => !term || `${v.label} ${v.sku}`.toLowerCase().includes(term))
      .map((v) => ({
        value: v.id,
        label: v.label,
        hint: [
          v.sku,
          formatCurrency(v.prices[channel]),
          v.available === null ? null : `${br(v.available)} disponíveis`,
        ]
          .filter(Boolean)
          .join(" · "),
      }));
  }

  async function searchPeople(q: string): Promise<PickerOption[]> {
    const hits = await searchCustomers(q);
    return hits.map((c) => ({
      value: c.id,
      label: c.name,
      hint: formatPhone(c.phone) || undefined,
    }));
  }

  function submit() {
    const payload = {
      as_quote: asQuote,
      channel,
      customer_id: customerId ?? "",
      customer_name: customerName,
      customer_phone: customerPhone,
      needs_art: needsArt,
      due_date: dueDate,
      payment_method_id: paymentId,
      discount,
      shipping,
      notes,
      items: rows.map((r) => ({
        id: r.id ?? "",
        variant_id: r.variant_id ?? "",
        description: r.description,
        quantity: r.quantity,
        unit_price: r.unit_price,
      })),
    };
    const check = orderSchema.safeParse(payload);
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Confira os dados do pedido.");
      return;
    }
    startTransition(async () => {
      const result = await saveOrder(payload, initial?.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      router.push(`/pedidos/${result.data.id}`);
    });
  }

  return (
    <form
      className="flex flex-col gap-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* Cliente e canal */}
      <Section title="Cliente">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-customer`}>Nome do cliente</Label>
            <SearchPicker
              id={`${ids}-customer`}
              value={customerName}
              minChars={2}
              placeholder="Busque um cliente ou digite o nome"
              emptyText="Nenhum cliente com esse nome — cadastre abaixo ou use só o nome digitado."
              onTextChange={(t) => {
                setCustomerName(t);
                setCustomerId(null);
              }}
              onPick={(o) => {
                setCustomerId(o.value);
                setCustomerName(o.label);
                if (o.hint) setCustomerPhone(o.hint);
              }}
              search={searchPeople}
            />
            {customerId ? (
              <p className="text-xs text-success">Cliente cadastrado selecionado.</p>
            ) : (
              <NewCustomerButton
                name={customerName}
                phone={customerPhone}
                channel={channel}
                onCreated={(c) => {
                  setCustomerId(c.id);
                  setCustomerName(c.name);
                  if (c.phone) setCustomerPhone(formatPhone(c.phone));
                }}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-phone`}>WhatsApp</Label>
            <Input
              id={`${ids}-phone`}
              type="tel"
              inputMode="tel"
              placeholder="(11) 98765-4321"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>
        </div>
        <fieldset className="mt-4 flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Canal</legend>
          <div className="flex flex-wrap gap-2">
            {SALES_CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={channel === c}
                onClick={() => changeChannel(c)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                  channel === c
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card hover:bg-muted",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-full", CHANNELS[c].dot)} />
                {CHANNELS[c].label}
              </button>
            ))}
          </div>
        </fieldset>
      </Section>

      {/* Itens */}
      <Section title="Itens" description="O preço vem do canal escolhido; você pode ajustar.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchPicker
            className="flex-1"
            value={productQuery}
            onTextChange={setProductQuery}
            onPick={addVariant}
            search={searchVariants}
            ariaLabel="Adicionar produto"
            placeholder="Adicionar produto: busque pelo nome ou SKU"
            emptyText="Nenhum produto. Cadastre em Cadastros → Produtos."
          />
          <Button type="button" variant="outline" onClick={addCustom}>
            <Plus />
            Item avulso
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum item ainda.
          </p>
        ) : (
          <ul className="@container mt-4 flex flex-col gap-3">
            {rows.map((r, i) => {
              const v = r.variant_id ? byId.get(r.variant_id) : undefined;
              const qty = num(r.quantity);
              const short = v && v.available !== null && qty > v.available && !r.locked;
              return (
                <li
                  key={r.key}
                  className="grid grid-cols-2 gap-2 rounded-xl border p-3 @xl:grid-cols-[1fr_6rem_8rem_7rem_auto] @xl:items-end"
                >
                  <div className="col-span-2 flex flex-col gap-1 @xl:col-span-1">
                    <Label htmlFor={`${ids}-${r.key}-d`} className="text-xs">
                      {v ? `Item ${i + 1} · ${v.sku}` : `Item ${i + 1} · avulso`}
                    </Label>
                    <Input
                      id={`${ids}-${r.key}-d`}
                      value={r.description}
                      placeholder="Descrição"
                      onChange={(e) => update(r.key, { description: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${ids}-${r.key}-q`} className="text-xs">
                      Qtd
                    </Label>
                    <Input
                      id={`${ids}-${r.key}-q`}
                      inputMode="decimal"
                      value={r.quantity}
                      disabled={r.locked}
                      onChange={(e) => update(r.key, { quantity: e.target.value })}
                      className="text-right"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`${ids}-${r.key}-p`} className="text-xs">
                      Preço (R$)
                    </Label>
                    <Input
                      id={`${ids}-${r.key}-p`}
                      inputMode="decimal"
                      value={r.unit_price}
                      onChange={(e) =>
                        update(r.key, { unit_price: e.target.value, priceEdited: true })
                      }
                      className="text-right"
                    />
                  </div>
                  <p className="self-center text-right text-sm font-medium @xl:self-end @xl:pb-2">
                    {formatCurrency(roundCents(qty * num(r.unit_price)))}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover item ${i + 1}`}
                    disabled={r.locked}
                    className="justify-self-end"
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 />
                  </Button>
                  {(short || r.locked) && (
                    <p
                      className={cn(
                        "col-span-2 text-xs @xl:col-span-5",
                        r.locked ? "text-muted-foreground" : "text-warning",
                      )}
                    >
                      {r.locked
                        ? "Já baixado do estoque: só a descrição e o preço podem mudar."
                        : `Atenção: só ${br(v?.available ?? 0)} disponíveis agora.`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Arte e prazo */}
      <Section title="Arte e prazo">
        <div className="grid gap-4 md:grid-cols-2">
          <label
            htmlFor={`${ids}-art`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2"
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium">Precisa de arte</span>
              <span className="text-xs text-muted-foreground">
                Gera o link para o cliente enviar a arte e aprovar a prova.
              </span>
            </span>
            <Switch id={`${ids}-art`} checked={needsArt} onCheckedChange={setNeedsArt} />
          </label>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-due`}>Data limite de postagem / entrega</Label>
            <Input
              id={`${ids}-due`}
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueTouched(true);
              }}
            />
            {suggestedDue && suggestedDue !== dueDate && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 self-start text-xs font-medium text-primary hover:underline md:min-h-0"
                onClick={() => {
                  setDueDate(suggestedDue);
                  setDueTouched(true);
                }}
              >
                <CalendarClock className="size-3.5" aria-hidden />
                Usar {formatDueDate(suggestedDue)} ({maxDays} dia(s) úteis de produção)
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Pagamento */}
      <Section title="Pagamento e observações">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-pay`}>Forma de pagamento</Label>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger id={`${ids}-pay`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Não informada</SelectItem>
                {payments.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-ship`}>Frete (R$)</Label>
            <Input
              id={`${ids}-ship`}
              inputMode="decimal"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className="text-right"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-disc`}>Desconto (R$)</Label>
            <Input
              id={`${ids}-disc`}
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="text-right"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-3">
            <Label htmlFor={`${ids}-notes`}>Observações</Label>
            <Textarea
              id={`${ids}-notes`}
              value={notes}
              rows={3}
              placeholder="Ex.: cores do logo, acabamento, retirada na loja"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </Section>

      {/* Rodapé fixo com total e ações */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 px-4 py-3 backdrop-blur md:sticky md:bottom-0 md:mx-0 md:rounded-2xl md:border md:px-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <dl className="flex gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Subtotal</dt>
              <dd>{formatCurrency(subtotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className={cn("text-base font-semibold", total < 0 && "text-destructive")}>
                {formatCurrency(total)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            {!initial && (
              <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                <Switch checked={asQuote} onCheckedChange={setAsQuote} />
                Salvar como orçamento
              </label>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <PackagePlus />}
              {initial ? "Salvar alterações" : asQuote ? "Criar orçamento" : "Criar pedido"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

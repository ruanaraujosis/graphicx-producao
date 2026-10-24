"use client";

import { CheckCircle2, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { type PickerOption, SearchPicker } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { parseDecimal } from "@/lib/form-schemas";
import { formatCurrency } from "@/lib/format";
import { formatPhone } from "@/lib/documents";
import { quickSale, searchCustomers } from "../actions";
import type { PaymentOption, VariantOption } from "../data";
import { NewCustomerButton } from "../new-customer";

type Line = {
  key: string;
  variantId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  available: number | null;
};

type Channel = "balcao" | "whatsapp";

/** Venda de balcão em uma tela: bipa/busca o produto, ajusta quantidade e finaliza. */
export function QuickSale({
  variants,
  payments,
}: {
  variants: VariantOption[];
  payments: PaymentOption[];
}) {
  const [channel, setChannel] = useState<Channel>("balcao");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payment, setPayment] = useState(payments[0]?.value ?? "");
  const [discountText, setDiscountText] = useState("");
  const [paid, setPaid] = useState(true);
  const [done, setDone] = useState<{ id: string; number: number; total: number } | null>(null);
  const [pending, start] = useTransition();

  const bySku = new Map(variants.map((v) => [v.sku.toUpperCase(), v]));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discount = Math.max(0, parseDecimal(discountText) ?? 0);
  const total = Math.max(0, subtotal - discount);
  const short = lines.filter((l) => l.available !== null && l.quantity > l.available);

  function addVariant(v: VariantOption) {
    setLines((list) => {
      const found = list.find((l) => l.variantId === v.id);
      if (found)
        return list.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...list,
        {
          key: v.id,
          variantId: v.id,
          description: v.label,
          quantity: 1,
          unitPrice: v.prices[channel],
          available: v.available,
        },
      ];
    });
    setSearch("");
  }

  function setQty(key: string, qty: number) {
    setLines((list) =>
      qty <= 0
        ? list.filter((l) => l.key !== key)
        : list.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }

  function changeChannel(c: Channel) {
    setChannel(c);
    // Preço do canal para os itens que vieram do cadastro.
    setLines((list) =>
      list.map((l) => {
        const v = byId.get(l.variantId);
        return v ? { ...l, unitPrice: v.prices[c] } : l;
      }),
    );
  }

  function reset() {
    setLines([]);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setDiscountText("");
    setPaid(true);
    setDone(null);
  }

  const finish = () =>
    start(async () => {
      const r = await quickSale({
        channel,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        payment_method_id: payment || null,
        discount,
        paid,
        items: lines.map((l) => ({
          variant_id: l.variantId,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unitPrice,
        })),
      });
      if (r.ok) {
        toast.success(r.message);
        setDone({ id: r.data.id, number: r.data.number, total });
      } else toast.error(r.error);
    });

  if (done) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="size-14 text-success" aria-hidden />
        <div>
          <p className="font-heading text-2xl font-bold">Venda #{done.number} lançada</p>
          <p className="text-muted-foreground">
            {formatCurrency(done.total)} · estoque baixado{paid ? " · pagamento recebido" : ""}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button className="min-h-11 flex-1" onClick={reset} autoFocus>
            <ShoppingCart />
            Nova venda
          </Button>
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <Link href={`/pedidos/${done.id}`}>Ver pedido</Link>
          </Button>
        </div>
      </section>
    );
  }

  const options = (q: string): PickerOption[] => {
    const term = q.trim().toLowerCase();
    return variants
      .filter(
        (v) => !term || v.sku.toLowerCase().includes(term) || v.label.toLowerCase().includes(term),
      )
      .slice(0, 30)
      .map((v) => ({
        value: v.id,
        label: `${v.sku} — ${v.label}`,
        hint: `${formatCurrency(v.prices[channel])}${v.available !== null ? ` · ${v.available} disp.` : ""}`,
      }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <Label htmlFor="qs-search">Produto (código SKU ou nome)</Label>
          <div
            onKeyDown={(e) => {
              // Leitor de código de barras: SKU exato + Enter já adiciona.
              if (e.key !== "Enter") return;
              const v = bySku.get(search.trim().toUpperCase());
              if (v) {
                e.preventDefault();
                addVariant(v);
              }
            }}
          >
            <SearchPicker
              id="qs-search"
              value={search}
              onTextChange={setSearch}
              onPick={(o) => {
                const v = byId.get(o.value);
                if (v) addVariant(v);
              }}
              search={options}
              placeholder="Bipe o código ou digite o nome"
              ariaLabel="Buscar produto"
              emptyText="Nenhum produto encontrado."
            />
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum produto na venda. Bipe ou busque acima.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {lines.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.description}</p>
                  <p
                    className={cn(
                      "text-xs",
                      l.available !== null && l.quantity > l.available
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {l.available === null ? "Sob encomenda" : `${l.available} disponível(is)`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 md:size-9"
                    aria-label="Menos um"
                    onClick={() => setQty(l.key, l.quantity - 1)}
                  >
                    <Minus />
                  </Button>
                  <Input
                    aria-label="Quantidade"
                    inputMode="numeric"
                    value={l.quantity}
                    onChange={(e) => setQty(l.key, Math.max(0, Number(e.target.value) || 0))}
                    className="h-11 w-16 text-center md:h-9"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-11 md:size-9"
                    aria-label="Mais um"
                    onClick={() => setQty(l.key, l.quantity + 1)}
                  >
                    <Plus />
                  </Button>
                </div>
                <span className="w-24 text-right font-medium tabular-nums">
                  {formatCurrency(l.quantity * l.unitPrice)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 text-destructive md:size-9"
                  aria-label="Tirar da venda"
                  onClick={() => setQty(l.key, 0)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:sticky lg:top-20 lg:self-start">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Canal</legend>
          {(
            [
              ["balcao", "Balcão"],
              ["whatsapp", "WhatsApp"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={channel === value}
              onClick={() => changeChannel(value)}
              className={cn(
                "min-h-11 flex-1 rounded-full border text-sm md:min-h-9",
                channel === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="qs-customer">Cliente (opcional)</Label>
          <SearchPicker
            id="qs-customer"
            value={customerName}
            minChars={2}
            placeholder="Consumidor final"
            emptyText="Nenhum cliente com esse nome — a venda usa o nome digitado."
            onTextChange={(t) => {
              setCustomerName(t);
              setCustomerId(null);
            }}
            onPick={(o) => {
              setCustomerId(o.value);
              setCustomerName(o.label);
              if (o.hint) setCustomerPhone(o.hint);
            }}
            search={async (q) =>
              (await searchCustomers(q)).map((c) => ({
                value: c.id,
                label: c.name,
                hint: formatPhone(c.phone) || undefined,
              }))
            }
          />
          {!customerId && customerName.trim().length >= 2 && (
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
          <Label htmlFor="qs-payment">Pagamento</Label>
          <select
            id="qs-payment"
            className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            <option value="">Não informado</option>
            {payments.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="qs-discount">Desconto (R$)</Label>
          <Input
            id="qs-discount"
            inputMode="decimal"
            placeholder="0,00"
            value={discountText}
            onChange={(e) => setDiscountText(e.target.value)}
            className="min-h-11 md:min-h-9"
          />
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <Switch checked={paid} onCheckedChange={setPaid} />
          Pagamento recebido agora
        </label>

        <dl className="flex flex-col gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="tabular-nums">− {formatCurrency(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-xl font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(total)}</dd>
          </div>
        </dl>

        {short.length > 0 && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            Quantidade maior que o estoque em {short.length} item(ns). A venda sai mesmo assim e o
            estoque fica negativo até a reposição.
          </p>
        )}

        <Button
          className="min-h-12 text-base"
          disabled={pending || lines.length === 0 || discount > subtotal}
          onClick={finish}
        >
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Finalizar venda
        </Button>
      </aside>
    </div>
  );
}

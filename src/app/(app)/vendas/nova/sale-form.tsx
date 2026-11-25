"use client";

import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { type PickerOption, SearchPicker } from "@/components/kit/search-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/form-schemas";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/documents";
import { searchCustomers } from "../../pedidos/actions";
import type { PaymentOption, VariantOption } from "../../pedidos/data";
import { NewCustomerButton } from "../../pedidos/new-customer";
import { authorizeDiscount, createSale, customerOverdue, type OverdueInfo } from "../actions";

type Line = {
  key: string;
  variantId: string;
  description: string;
  complement: string;
  quantity: number;
  unitPrice: number;
  priceText: string;
  priceEdited: boolean;
  hasBom: boolean;
  available: number | null;
};

type Channel = "balcao" | "whatsapp";

export type SaleSettings = {
  sellerMaxDiscount: number;
  managerMaxDiscount: number;
  requirePaymentMethod: boolean;
  warnOverdue: boolean;
  defaultNote: string;
};

type Authorization = { id: string; percent: number; managerName: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pedido de venda em uma tela: bipa/busca o produto, ajusta quantidade e finaliza. */
export function SaleForm({
  variants,
  payments,
  sellers,
  currentUserId,
  settings,
  canDiscount,
  canEditRecipePrice,
}: {
  variants: VariantOption[];
  payments: PaymentOption[];
  sellers: { value: string; label: string }[];
  currentUserId: string;
  settings: SaleSettings;
  canDiscount: boolean;
  canEditRecipePrice: boolean;
}) {
  const [channel, setChannel] = useState<Channel>("balcao");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [overdue, setOverdue] = useState<OverdueInfo | null>(null);
  const [seller, setSeller] = useState(currentUserId);
  const [payment, setPayment] = useState(payments[0]?.value ?? "");
  const [discountText, setDiscountText] = useState("");
  const [notes, setNotes] = useState(settings.defaultNote);
  const [paid, setPaid] = useState(true);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [done, setDone] = useState<{ id: string; number: number; total: number } | null>(null);
  const [pending, start] = useTransition();

  const bySku = new Map(variants.map((v) => [v.sku.toUpperCase(), v]));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const subtotal = round2(lines.reduce((s, l) => s + round2(l.quantity * l.unitPrice), 0));
  const discount = canDiscount ? Math.max(0, parseDecimal(discountText) ?? 0) : 0;
  const total = Math.max(0, round2(subtotal - discount));
  const percent = subtotal > 0 ? round2((discount * 100) / subtotal) : 0;
  const short = lines.filter((l) => l.available !== null && l.quantity > l.available);
  const overManager = percent > settings.managerMaxDiscount;
  const needsManager = percent > settings.sellerMaxDiscount && !overManager;
  const authorized = Boolean(authorization && authorization.percent >= percent);
  const missingPayment = settings.requirePaymentMethod && !payment;
  const blocked =
    lines.length === 0 ||
    discount > subtotal ||
    overManager ||
    (needsManager && !authorized) ||
    missingPayment;

  function addVariant(v: VariantOption) {
    setLines((list) => {
      const found = list.find((l) => l.variantId === v.id);
      if (found)
        return list.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + 1 } : l));
      const price = v.prices[channel];
      return [
        ...list,
        {
          key: v.id,
          variantId: v.id,
          description: v.label,
          complement: "",
          quantity: 1,
          unitPrice: price,
          priceText: price.toFixed(2).replace(".", ","),
          priceEdited: false,
          hasBom: v.hasBom,
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

  function setPrice(key: string, text: string) {
    setLines((list) =>
      list.map((l) =>
        l.key === key
          ? {
              ...l,
              priceText: text,
              unitPrice: Math.max(0, parseDecimal(text) ?? 0),
              priceEdited: true,
            }
          : l,
      ),
    );
  }

  function changeChannel(c: Channel) {
    setChannel(c);
    // Preço do canal para os itens que não tiveram o preço trocado.
    setLines((list) =>
      list.map((l) => {
        const v = byId.get(l.variantId);
        if (!v || l.priceEdited) return l;
        const price = v.prices[c];
        return { ...l, unitPrice: price, priceText: price.toFixed(2).replace(".", ",") };
      }),
    );
  }

  function pickCustomer(id: string | null) {
    setCustomerId(id);
    setOverdue(null);
    if (id && settings.warnOverdue) {
      void customerOverdue(id).then((info) => setOverdue(info && info.count > 0 ? info : null));
    }
  }

  function reset() {
    setLines([]);
    pickCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setDiscountText("");
    setNotes(settings.defaultNote);
    setSeller(currentUserId);
    setPaid(true);
    setAuthorization(null);
    setDone(null);
  }

  const finish = () =>
    start(async () => {
      const r = await createSale({
        channel,
        customer_id: customerId,
        customer_name: customerName,
        customer_phone: customerPhone,
        seller_id: seller || null,
        payment_method_id: payment || null,
        discount,
        notes,
        paid,
        authorization_id: needsManager && authorization ? authorization.id : null,
        items: lines.map((l) => ({
          variant_id: l.variantId,
          description: l.description,
          complement: l.complement,
          quantity: l.quantity,
          unit_price: l.priceEdited ? l.unitPrice : null,
        })),
      });
      if (r.ok) {
        toast.success(r.message);
        setDone({ id: r.data.id, number: r.data.number, total });
      } else {
        toast.error(r.error);
        // Liberação usada ou vencida: pede de novo.
        if (/liberação/i.test(r.error)) setAuthorization(null);
      }
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
            <Link href={`/pedidos/${done.id}`}>Ver venda</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <a href={`/imprimir/vendas/${done.id}`} target="_blank" rel="noopener">
              <Printer />
              Imprimir
            </a>
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
          <Label htmlFor="sale-search">Produto (código SKU ou nome)</Label>
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
              id="sale-search"
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
                  <Input
                    aria-label={`Complemento de ${l.description}`}
                    placeholder="Complemento (opcional, sai na impressão)"
                    maxLength={500}
                    value={l.complement}
                    onChange={(e) =>
                      setLines((list) =>
                        list.map((x) =>
                          x.key === l.key ? { ...x, complement: e.target.value } : x,
                        ),
                      )
                    }
                    className="mt-1 h-11 text-xs md:h-8"
                  />
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
                {l.hasBom && canEditRecipePrice ? (
                  <Input
                    aria-label={`Preço unitário de ${l.description}`}
                    inputMode="decimal"
                    value={l.priceText}
                    onChange={(e) => setPrice(l.key, e.target.value)}
                    className="h-11 w-24 text-right md:h-9"
                  />
                ) : null}
                <span className="w-24 text-right font-medium tabular-nums">
                  {formatCurrency(round2(l.quantity * l.unitPrice))}
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
          <Label htmlFor="sale-customer">Cliente (opcional)</Label>
          <SearchPicker
            id="sale-customer"
            value={customerName}
            minChars={2}
            placeholder="Consumidor final"
            emptyText="Nenhum cliente com esse nome — a venda usa o nome digitado."
            onTextChange={(t) => {
              setCustomerName(t);
              pickCustomer(null);
            }}
            onPick={(o) => {
              pickCustomer(o.value);
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
          {customerId ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-success">
              Cliente cadastrado selecionado.
              <button
                type="button"
                className="min-h-11 text-muted-foreground underline md:min-h-0"
                onClick={() => {
                  pickCustomer(null);
                  setCustomerName("");
                  setCustomerPhone("");
                }}
              >
                Trocar
              </button>
            </p>
          ) : (
            <NewCustomerButton
              name={customerName}
              phone={customerPhone}
              channel={channel}
              onCreated={(c) => {
                pickCustomer(c.id);
                setCustomerName(c.name);
                if (c.phone) setCustomerPhone(formatPhone(c.phone));
              }}
            />
          )}
          {overdue && (
            <p
              role="status"
              className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning"
            >
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>
                Cliente com {overdue.count} conta(s) em atraso: {formatCurrency(overdue.total)}
                {overdue.oldest
                  ? `, a mais antiga venceu em ${formatDate(`${overdue.oldest}T12:00:00`)}`
                  : ""}
                .
              </span>
            </p>
          )}
        </div>

        {sellers.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-seller">Vendedor</Label>
            <select
              id="sale-seller"
              className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
            >
              {sellers.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="sale-payment">
            Pagamento{settings.requirePaymentMethod ? " (obrigatório)" : ""}
          </Label>
          <select
            id="sale-payment"
            className="min-h-11 rounded-lg border bg-background px-3 text-sm md:min-h-9"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            aria-invalid={missingPayment}
          >
            <option value="">Não informado</option>
            {payments.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {canDiscount ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sale-discount">Desconto (R$)</Label>
            <Input
              id="sale-discount"
              inputMode="decimal"
              placeholder="0,00"
              value={discountText}
              onChange={(e) => setDiscountText(e.target.value)}
              className="min-h-11 md:min-h-9"
              aria-describedby="sale-discount-help"
            />
            <p id="sale-discount-help" className="text-xs text-muted-foreground">
              {discount > 0 ? `${percent.toLocaleString("pt-BR")}% · ` : ""}
              Seu limite: {settings.sellerMaxDiscount.toLocaleString("pt-BR")}%. Até{" "}
              {settings.managerMaxDiscount.toLocaleString("pt-BR")}% com liberação do gerente.
            </p>
            {overManager && (
              <p role="alert" className="text-xs text-destructive">
                Passa do limite de {settings.managerMaxDiscount.toLocaleString("pt-BR")}% da
                gráfica.
              </p>
            )}
            {needsManager &&
              (authorized && authorization ? (
                <p className="text-xs text-success">
                  Liberado por {authorization.managerName} (até{" "}
                  {authorization.percent.toLocaleString("pt-BR")}%).
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 md:min-h-9"
                  onClick={() => setAuthOpen(true)}
                >
                  <KeyRound />
                  Pedir liberação do gerente
                </Button>
              ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="sale-notes">Observação</Label>
          <Textarea
            id="sale-notes"
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

        <Button className="min-h-12 text-base" disabled={pending || blocked} onClick={finish}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Finalizar venda
        </Button>
      </aside>

      <ManagerDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        percent={percent}
        onAuthorized={(a) => {
          setAuthorization(a);
          setAuthOpen(false);
          toast.success(`Desconto liberado por ${a.managerName}.`);
        }}
      />
    </div>
  );
}

/** O gerente digita o próprio usuário e senha no aparelho do vendedor. */
function ManagerDialog({
  open,
  onOpenChange,
  percent,
  onAuthorized,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  percent: number;
  onAuthorized: (a: Authorization) => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = (next: boolean) => {
    if (!next) {
      setPassword("");
      setCode("");
      setNeedsCode(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const r = await authorizeDiscount({ identifier, password, code, percent });
      if (r.ok) {
        setPassword("");
        setCode("");
        setNeedsCode(false);
        setError(null);
        onAuthorized({ id: r.authorizationId, percent, managerName: r.managerName });
      } else {
        setError(r.error);
        if (r.needsCode) setNeedsCode(true);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Liberação do gerente</DialogTitle>
            <DialogDescription>
              Desconto de {percent.toLocaleString("pt-BR")}%. O gerente digita o próprio usuário e
              senha; vale só para esta venda, por 5 minutos. A sessão do vendedor não muda.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="mgr-identifier">E-mail ou usuário do gerente</Label>
            <Input
              id="mgr-identifier"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mgr-password">Senha do gerente</Label>
            <Input
              id="mgr-password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11"
            />
          </div>
          {needsCode && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="mgr-code">Código do app autenticador do gerente</Label>
              <Input
                id="mgr-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="min-h-11 text-center tracking-widest"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => close(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Liberar desconto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Loader2, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { parseDecimal } from "@/lib/form-schemas";
import { saveSalesSettings } from "./actions";

export type SalesSettingsValues = {
  seller_max_discount: number;
  manager_max_discount: number;
  require_payment_method: boolean;
  warn_overdue_receivables: boolean;
  tag_first_purchase: boolean;
  warn_incomplete_address: boolean;
  default_note: string;
  print_code: "qr" | "barras";
  print_product_images: boolean;
  print_item_order: "inclusao" | "sku" | "descricao";
};

type Toggle =
  | "require_payment_method"
  | "warn_overdue_receivables"
  | "tag_first_purchase"
  | "warn_incomplete_address"
  | "print_product_images";

const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
  {
    key: "require_payment_method",
    label: "Forma de pagamento obrigatória",
    hint: "A venda só fecha com o pagamento informado.",
  },
  {
    key: "warn_overdue_receivables",
    label: "Avisar cliente com contas em atraso",
    hint: "Mostra no pedido quanto o cliente deve e desde quando.",
  },
  {
    key: "tag_first_purchase",
    label: "Marcar “1ª compra”",
    hint: "Para clientes cadastrados sem pedidos anteriores.",
  },
  {
    key: "warn_incomplete_address",
    label: "Avisar endereço incompleto",
    hint: "Quando o pedido tiver entrega e faltar CEP, rua ou cidade.",
  },
  {
    key: "print_product_images",
    label: "Imagem dos produtos na impressão",
    hint: "Usada no documento do pedido de venda.",
  },
];

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function SalesSettingsForm({
  initial,
  canManage,
}: {
  initial: SalesSettingsValues;
  canManage: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [sellerText, setSellerText] = useState(fmt(initial.seller_max_discount));
  const [managerText, setManagerText] = useState(fmt(initial.manager_max_discount));
  const [pending, start] = useTransition();
  const set = <K extends keyof SalesSettingsValues>(key: K, value: SalesSettingsValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const r = await saveSalesSettings({
        ...values,
        seller_max_discount: parseDecimal(sellerText) ?? -1,
        manager_max_discount: parseDecimal(managerText) ?? -1,
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 font-heading text-lg font-semibold">Descontos</h2>
        <fieldset disabled={!canManage} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Limites de desconto</legend>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ss-seller">Limite do vendedor (%)</Label>
            <Input
              id="ss-seller"
              inputMode="decimal"
              value={sellerText}
              onChange={(e) => setSellerText(e.target.value)}
              className="min-h-11"
            />
            <p className="text-xs text-muted-foreground">
              Quem tem a permissão de vendedor dá até este desconto sozinho.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ss-manager">Limite com liberação do gerente (%)</Label>
            <Input
              id="ss-manager"
              inputMode="decimal"
              value={managerText}
              onChange={(e) => setManagerText(e.target.value)}
              className="min-h-11"
            />
            <p className="text-xs text-muted-foreground">
              Acima do limite do vendedor, quem pode “liberar desconto” autoriza até aqui.
            </p>
          </div>
        </fieldset>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="mb-2 font-heading text-lg font-semibold">Regras e impressão</h2>
        <fieldset disabled={!canManage}>
          <legend className="sr-only">Regras e impressão</legend>
          <ul className="divide-y">
            {TOGGLES.map((t) => (
              <li key={t.key}>
                <label className="flex min-h-11 items-center justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                  <Switch checked={values[t.key]} onCheckedChange={(c) => set(t.key, c)} />
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ss-code">Código do pedido na impressão</Label>
              <select
                id="ss-code"
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                value={values.print_code}
                onChange={(e) => set("print_code", e.target.value as "qr" | "barras")}
              >
                <option value="qr">QR Code</option>
                <option value="barras">Código de barras</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ss-order">Ordem dos itens na impressão</Label>
              <select
                id="ss-order"
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
                value={values.print_item_order}
                onChange={(e) =>
                  set("print_item_order", e.target.value as SalesSettingsValues["print_item_order"])
                }
              >
                <option value="inclusao">Ordem de inclusão</option>
                <option value="sku">SKU</option>
                <option value="descricao">Descrição</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="ss-note">Observação padrão</Label>
              <Textarea
                id="ss-note"
                rows={3}
                maxLength={1000}
                value={values.default_note}
                onChange={(e) => set("default_note", e.target.value)}
                placeholder="Ex.: Trocas em até 7 dias com este pedido."
              />
              <p className="text-xs text-muted-foreground">
                Já vem preenchida em toda venda nova e sai impressa no pedido.
              </p>
            </div>
          </div>
        </fieldset>
      </section>

      {canManage && (
        <Button type="submit" className="min-h-11 self-end" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      )}
    </form>
  );
}

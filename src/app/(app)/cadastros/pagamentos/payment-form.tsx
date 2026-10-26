"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldConfig } from "@/components/kit/entity-form";
import { savePaymentMethod } from "./actions";
import { PAYMENT_KIND_LABELS, PAYMENT_KINDS, paymentMethodSchema } from "./schema";

export type PaymentMethodRow = {
  id: string;
  name: string;
  kind: (typeof PAYMENT_KINDS)[number];
  fee_pct: number;
  settlement_days: number;
  active: boolean;
};

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Nome", placeholder: "Ex.: Cartão crédito Stone" },
  {
    name: "kind",
    label: "Tipo",
    type: "select",
    options: PAYMENT_KINDS.map((k) => ({ value: k, label: PAYMENT_KIND_LABELS[k] })),
  },
  {
    name: "fee_pct",
    label: "Taxa (%)",
    type: "number",
    half: true,
    hint: "Desconto da maquininha ou do marketplace.",
  },
  {
    name: "settlement_days",
    label: "Recebe em (dias)",
    type: "number",
    inputMode: "numeric",
    half: true,
    hint: "0 = na hora.",
  },
];

export function PaymentMethodFormDialog({ method }: { method?: PaymentMethodRow }) {
  return (
    <EntityFormDialog
      title={method ? "Editar forma de pagamento" : "Nova forma de pagamento"}
      trigger={
        method ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${method.name}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus />
            Nova forma
          </Button>
        )
      }
      schema={paymentMethodSchema}
      defaultValues={{
        name: method?.name ?? "",
        kind: method?.kind ?? "pix",
        fee_pct: String(method?.fee_pct ?? 0).replace(".", ","),
        settlement_days: String(method?.settlement_days ?? 0),
        active: method?.active ?? true,
      }}
      fields={method ? [...FIELDS, { name: "active", label: "Ativa", type: "switch" }] : FIELDS}
      action={(values) => savePaymentMethod(method?.id ?? null, values)}
      submitLabel={method ? "Salvar" : "Cadastrar"}
    />
  );
}

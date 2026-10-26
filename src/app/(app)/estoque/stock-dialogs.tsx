"use client";

import { ArrowLeftRight, ClipboardMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldOption } from "@/components/kit/entity-form";
import { MOVEMENT_LABELS } from "@/lib/stock/units";
import { consumeByBom, registerMovement } from "./actions";
import { MANUAL_MOVEMENTS, consumeSchema, movementSchema } from "./schema";

const HINTS: Record<(typeof MANUAL_MOVEMENTS)[number], string> = {
  entrada: "Compra ou recebimento. Informe o custo para atualizar o custo médio.",
  saida: "Saída avulsa (ex.: uso interno, amostra).",
  ajuste: "Correção de inventário: positivo soma, negativo subtrai.",
  perda: "Quebra, defeito, validade.",
  reserva: "Separa para um pedido sem tirar do estoque.",
  liberacao: "Devolve uma reserva ao disponível.",
};

export function MovementDialog({ items }: { items: readonly FieldOption[] }) {
  return (
    <EntityFormDialog
      title="Lançar movimentação"
      description="O lançamento fica no histórico e não pode ser apagado; para corrigir, lance um ajuste."
      trigger={
        <Button>
          <ArrowLeftRight />
          Lançar movimentação
        </Button>
      }
      schema={movementSchema}
      defaultValues={{ item: "", type: "entrada", quantity: "", unit_cost: "", reason: "" }}
      fields={[
        {
          name: "item",
          label: "Item",
          type: "select",
          options: items,
          placeholder: "Escolha o insumo ou produto",
        },
        {
          name: "type",
          label: "Tipo",
          type: "select",
          half: true,
          options: MANUAL_MOVEMENTS.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] })),
        },
        { name: "quantity", label: "Quantidade", type: "number", half: true },
        {
          name: "unit_cost",
          label: "Custo unitário (R$)",
          type: "number",
          hint: HINTS.entrada,
          showWhen: (v) => v.type === "entrada" && String(v.item ?? "").startsWith("material:"),
        },
        { name: "reason", label: "Motivo / observação", placeholder: "Ex.: NF 1234 do fornecedor" },
      ]}
      action={registerMovement}
      submitLabel="Lançar"
    />
  );
}

export function ConsumeDialog({ variants }: { variants: readonly FieldOption[] }) {
  return (
    <EntityFormDialog
      title="Baixa pela ficha técnica"
      description="Consome os insumos de N unidades de uma variação (venda de balcão ou produção)."
      trigger={
        <Button variant="outline" disabled={variants.length === 0}>
          <ClipboardMinus />
          Baixa por ficha técnica
        </Button>
      }
      schema={consumeSchema}
      defaultValues={{ variant_id: "", quantity: "1", reference: "" }}
      fields={[
        { name: "variant_id", label: "Produto / variação", type: "select", options: variants },
        { name: "quantity", label: "Unidades", type: "number", half: true },
        { name: "reference", label: "Referência", half: true, placeholder: "Ex.: venda balcão" },
      ]}
      action={consumeByBom}
      submitLabel="Dar baixa"
    />
  );
}

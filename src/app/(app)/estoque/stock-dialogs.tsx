"use client";

import { ArrowLeftRight, ClipboardCheck, ClipboardMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityFormDialog, type FieldOption } from "@/components/kit/entity-form";
import { parseDecimal } from "@/lib/form-schemas";
import { MOVEMENT_LABELS } from "@/lib/stock/units";
import { consumeByBom, countInventory, registerMovement } from "./actions";
import type { StockItemOption } from "./data";
import { MANUAL_MOVEMENTS, consumeSchema, inventorySchema, movementSchema } from "./schema";

const HINTS: Record<(typeof MANUAL_MOVEMENTS)[number], string> = {
  entrada: "Compra ou recebimento. Informe o custo para atualizar o custo médio.",
  saida: "Saída avulsa (ex.: uso interno, amostra).",
  perda: "Quebra, defeito, validade.",
  reserva: "Separa para um pedido sem tirar do estoque.",
  liberacao: "Devolve uma reserva ao disponível.",
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function MovementDialog({ items }: { items: readonly FieldOption[] }) {
  return (
    <EntityFormDialog
      title="Lançar movimentação"
      description="O lançamento fica no histórico e não pode ser apagado. Para corrigir o saldo, use o Inventário."
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
          type: "search",
          options: items,
          placeholder: "Buscar insumo ou produto por nome ou SKU",
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

/** Inventário: a quantidade contada passa a ser o saldo (não é somada). */
export function InventoryDialog({ items }: { items: readonly StockItemOption[] }) {
  return (
    <EntityFormDialog
      title="Inventário"
      description="Digite a quantidade que você contou. Ela passa a ser o saldo do item; a diferença fica registrada no histórico com o motivo e quem contou."
      trigger={
        <Button variant="outline">
          <ClipboardCheck />
          Inventário
        </Button>
      }
      schema={inventorySchema}
      defaultValues={{ item: "", counted: "", reason: "Contagem de inventário" }}
      fields={[
        {
          name: "item",
          label: "Item",
          type: "search",
          options: items,
          placeholder: "Buscar insumo ou produto por nome ou SKU",
        },
        { name: "counted", label: "Quantidade contada", type: "number", half: true },
        { name: "reason", label: "Motivo", half: true },
      ]}
      preview={(v) => {
        const item = items.find((i) => i.value === v.item);
        if (!item) return null;
        const counted = parseDecimal(v.counted);
        if (counted === undefined || Number.isNaN(counted) || counted < 0) {
          return (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm">
              Saldo atual: <strong>{fmt(item.onHand)}</strong>
            </p>
          );
        }
        const diff = counted - item.onHand;
        return (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">
            Saldo atual <strong>{fmt(item.onHand)}</strong> → saldo final{" "}
            <strong>{fmt(counted)}</strong>{" "}
            <span className={diff < 0 ? "text-destructive" : diff > 0 ? "text-success" : ""}>
              ({diff > 0 ? "+" : ""}
              {fmt(diff)})
            </span>
          </p>
        );
      }}
      action={countInventory}
      submitLabel="Ajustar saldo"
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
        {
          name: "variant_id",
          label: "Produto / variação",
          type: "search",
          options: variants,
          placeholder: "Buscar por nome ou SKU",
        },
        { name: "quantity", label: "Unidades", type: "number", half: true },
        { name: "reference", label: "Referência", half: true, placeholder: "Ex.: venda balcão" },
      ]}
      action={consumeByBom}
      submitLabel="Dar baixa"
    />
  );
}

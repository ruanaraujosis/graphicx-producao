import { z } from "zod";
import { decimal, optionalText, parseDecimal } from "@/lib/form-schemas";

/**
 * Tipos que se lançam à mão. "consumo" vem só da baixa pela ficha técnica e "ajuste" só do
 * inventário (a quantidade contada define o saldo final).
 */
export const MANUAL_MOVEMENTS = ["entrada", "saida", "perda", "reserva", "liberacao"] as const;

export const movementSchema = z
  .object({
    item: z
      .string({ error: "Escolha o item." })
      .regex(/^(material|variant):[0-9a-f-]{36}$/i, "Escolha o item."),
    type: z.enum(MANUAL_MOVEMENTS, { error: "Escolha o tipo." }),
    quantity: z.preprocess(
      (v) => parseDecimal(v),
      z
        .number({ error: "Informe a quantidade." })
        .refine((n) => n > 0, "A quantidade precisa ser maior que zero.")
        .refine((n) => Math.abs(n) <= 10_000_000, "Quantidade grande demais."),
    ),
    unit_cost: decimal({ label: "Custo unitário", min: 0, max: 1_000_000, optional: true }),
    reason: optionalText(500),
  })
  .refine((v) => v.unit_cost === null || (v.type === "entrada" && v.item.startsWith("material:")), {
    path: ["unit_cost"],
    message: "Custo só vale para entrada de insumo.",
  });

export const consumeSchema = z.object({
  variant_id: z.uuid({ error: "Escolha a variação." }),
  quantity: decimal({ label: "Quantidade", min: 0.001, max: 1_000_000 }),
  reference: optionalText(120),
});

export const ITEM_RE = /^(material|variant):[0-9a-f-]{36}$/i;

/** Inventário: a quantidade contada vira o saldo final. */
export const inventorySchema = z.object({
  item: z.string({ error: "Escolha o item." }).regex(ITEM_RE, "Escolha o item."),
  counted: decimal({ label: "Quantidade contada", min: 0, max: 10_000_000 }),
  reason: z
    .string({ error: "Informe o motivo." })
    .trim()
    .min(3, "Informe o motivo (ex.: contagem mensal).")
    .max(500, "Motivo longo demais."),
});

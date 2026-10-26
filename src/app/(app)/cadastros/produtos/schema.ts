import { z } from "zod";
import { SALES_CHANNELS } from "@/lib/catalog/pricing";
import {
  bool,
  decimal,
  integer,
  optionalText,
  optionalUuid,
  parseDecimal,
  requiredText,
} from "@/lib/form-schemas";

const digitsOrNull = (len: number, label: string) =>
  z.preprocess(
    (v) => {
      const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
      return d === "" ? null : d;
    },
    z
      .string()
      .regex(new RegExp(`^\\d{${len}}$`), `${label} deve ter ${len} dígitos.`)
      .nullable(),
  );

/** Fica aqui, e não no formulário ("use client"), para os componentes de servidor lerem o valor. */
export const FULFILLMENT_LABELS = {
  sob_encomenda: "Sob encomenda",
  pronta_entrega: "Pronta-entrega",
} as const;

export const productSchema = z.object({
  name: requiredText("o nome do produto"),
  category_id: optionalUuid,
  fulfillment: z.enum(["sob_encomenda", "pronta_entrega"]),
  production_days: integer({ label: "Prazo de produção", min: 0, max: 90 }),
  description: optionalText(5000),
  ncm: digitsOrNull(8, "NCM"),
  cest: digitsOrNull(7, "CEST"),
  cfop: digitsOrNull(4, "CFOP"),
  active: bool,
});

export const ATTRIBUTE_KEYS = ["tamanho", "espessura", "cor", "acabamento"] as const;
export const ATTRIBUTE_LABELS: Record<(typeof ATTRIBUTE_KEYS)[number], string> = {
  tamanho: "Tamanho",
  espessura: "Espessura",
  cor: "Cor",
  acabamento: "Acabamento",
};

export const variantSchema = z.object({
  name: requiredText("o nome da variação", 1, 120),
  sku: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z
      .string({ error: "Informe o SKU." })
      .regex(/^[A-Z0-9._-]{2,40}$/, "SKU: letras, números, ponto, hífen ou _ (2 a 40)."),
  ),
  tamanho: optionalText(40),
  espessura: optionalText(40),
  cor: optionalText(40),
  acabamento: optionalText(60),
  base_price: decimal({ label: "Preço base", min: 0, max: 1_000_000 }),
  weight_g: integer({ label: "Peso", min: 0, max: 100_000, optional: true }),
  length_cm: decimal({ label: "Comprimento", min: 0, max: 1000, optional: true }),
  width_cm: decimal({ label: "Largura", min: 0, max: 1000, optional: true }),
  height_cm: decimal({ label: "Altura", min: 0, max: 1000, optional: true }),
  active: bool,
});

/** Preço manual por canal: vazio = usa a regra (base + ajuste do canal). */
export const variantPricesSchema = z.record(
  z.enum(SALES_CHANNELS),
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : parseDecimal(v)),
    z.number({ error: "Preço inválido." }).min(0, "Preço não pode ser negativo.").nullable(),
  ),
);

export const bomSchema = z
  .array(
    z.object({
      material_id: z.uuid({ error: "Escolha o insumo." }),
      quantity: decimal({ label: "Quantidade", min: 0.0001, max: 1_000_000 }),
      waste_pct: decimal({ label: "Perda", min: 0, max: 100 }),
    }),
  )
  .max(50, "Máximo de 50 insumos por ficha.")
  .refine((items) => new Set(items.map((i) => i.material_id)).size === items.length, {
    message: "O mesmo insumo aparece duas vezes na ficha.",
  });

import { z } from "zod";
import { bool, decimal, optionalText, optionalUuid, requiredText } from "@/lib/form-schemas";
import { UNITS } from "@/lib/stock/units";

export const materialSchema = z.object({
  name: requiredText("o nome"),
  sku: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toUpperCase() : null),
    z
      .string()
      .regex(/^[A-Z0-9._-]{2,40}$/, "Código: letras, números, ponto, hífen ou _ (2 a 40).")
      .nullable(),
  ),
  unit: z.enum(UNITS, { error: "Escolha a unidade." }),
  min_stock: decimal({ label: "Estoque mínimo", min: 0, max: 1_000_000 }),
  supplier_id: optionalUuid,
  notes: optionalText(2000),
  active: bool,
});

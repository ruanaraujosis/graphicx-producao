import { z } from "zod";
import { SALES_CHANNELS } from "@/lib/catalog/pricing";
import {
  bool,
  decimal,
  optionalPhone,
  optionalText,
  optionalUuid,
  requiredText,
} from "@/lib/form-schemas";

export const orderItemSchema = z.object({
  id: optionalUuid,
  variant_id: optionalUuid,
  description: requiredText("a descrição do item", 1, 300),
  quantity: decimal({ label: "Quantidade", min: 0.001, max: 1_000_000 }),
  unit_price: decimal({ label: "Preço", min: 0, max: 10_000_000 }),
});

export const orderSchema = z.object({
  /** Só na criação: orçamento ou pedido. */
  as_quote: bool,
  channel: z.enum(SALES_CHANNELS, { error: "Escolha o canal." }),
  customer_id: optionalUuid,
  customer_name: requiredText("o nome do cliente"),
  customer_phone: optionalPhone,
  needs_art: bool,
  due_date: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.iso.date({ error: "Data inválida." }).nullable(),
  ),
  payment_method_id: optionalUuid,
  discount: decimal({ label: "Desconto", min: 0, max: 10_000_000 }),
  shipping: decimal({ label: "Frete", min: 0, max: 10_000_000 }),
  notes: optionalText(2000),
  items: z
    .array(orderItemSchema)
    .min(1, "Inclua pelo menos um item.")
    .max(100, "Máximo de 100 itens."),
});

export type OrderInput = z.input<typeof orderSchema>;
export type OrderItemInput = z.input<typeof orderItemSchema>;

export const commentSchema = z.object({
  order_id: z.uuid(),
  message: requiredText("o comentário", 1, 2000),
});

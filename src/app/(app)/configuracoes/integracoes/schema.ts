import { z } from "zod";
import { bool, integer, optionalText } from "@/lib/form-schemas";

export const shopSettingsSchema = z.object({
  name: optionalText(160),
  stock_pct: integer({ label: "Margem de estoque", min: 10, max: 100 }),
  price_sync_enabled: bool,
  chat_message_enabled: bool,
  chat_template: optionalText(1000),
});

export const DEFAULT_CHAT_TEMPLATE =
  "Olá! Obrigado pela compra na {loja}. Envie a arte do seu pedido {pedido} por este link: {link}";

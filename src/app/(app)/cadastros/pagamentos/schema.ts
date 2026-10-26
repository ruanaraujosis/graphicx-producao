import { z } from "zod";
import { bool, decimal, integer, requiredText } from "@/lib/form-schemas";

export const PAYMENT_KINDS = [
  "pix",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "dinheiro",
  "marketplace",
  "outro",
] as const;

export const PAYMENT_KIND_LABELS: Record<(typeof PAYMENT_KINDS)[number], string> = {
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
  marketplace: "Repasse de marketplace",
  outro: "Outro",
};

export const paymentMethodSchema = z.object({
  name: requiredText("o nome", 2, 80),
  kind: z.enum(PAYMENT_KINDS, { error: "Escolha o tipo." }),
  fee_pct: decimal({ label: "Taxa", min: 0, max: 100 }),
  settlement_days: integer({ label: "Prazo de recebimento", min: 0, max: 365 }),
  active: bool,
});

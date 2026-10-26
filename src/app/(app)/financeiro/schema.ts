import { z } from "zod";
import { decimal, optionalText, optionalUuid, requiredText } from "@/lib/form-schemas";

const isoDate = (label: string) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.iso.date({ error: `Informe ${label}.` }));

/** Conta a receber avulsa (as de pedido só mudam taxa, vencimento e observação). */
export const receivableSchema = z
  .object({
    description: requiredText("a descrição", 2, 200),
    customer_name: optionalText(160),
    gross: decimal({ label: "Valor", min: 0.01, max: 10_000_000 }),
    fee: decimal({ label: "Taxa", min: 0, max: 10_000_000 }),
    due_date: isoDate("o vencimento"),
    notes: optionalText(1000),
  })
  .refine((v) => v.fee <= v.gross, { path: ["fee"], message: "A taxa não pode passar do valor." });

export const payableSchema = z.object({
  description: requiredText("a descrição", 2, 200),
  supplier_id: optionalUuid,
  category_id: optionalUuid,
  amount: decimal({ label: "Valor", min: 0.01, max: 10_000_000 }),
  due_date: isoDate("o vencimento"),
  recurrence: z.enum(["nenhuma", "mensal"], { error: "Escolha a recorrência." }),
  notes: optionalText(1000),
});

/** Baixa: data do recebimento ou do pagamento. */
export const settleSchema = z.object({ date: isoDate("a data") });

export const categorySchema = z.object({ name: requiredText("o nome", 2, 60) });

export const goalSchema = z.object({
  monthly_goal: decimal({ label: "Meta do mês", min: 0, max: 100_000_000, optional: true }),
});

export const RECEIVABLE_STATUS = {
  aberto: { label: "Em aberto", tone: "info" },
  recebido: { label: "Recebido", tone: "success" },
  cancelado: { label: "Cancelado", tone: "muted" },
} as const;

export const PAYABLE_STATUS = {
  aberto: { label: "Em aberto", tone: "info" },
  pago: { label: "Pago", tone: "success" },
  cancelado: { label: "Cancelado", tone: "muted" },
} as const;

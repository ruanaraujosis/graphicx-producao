"use server";

import { z } from "zod";
import { saveOrgRecord, type ActionResult } from "@/lib/crud";
import { paymentMethodSchema } from "./schema";

export async function savePaymentMethod(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = paymentMethodSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Forma de pagamento inválida." };

  return saveOrgRecord({
    table: "payment_methods",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: "/cadastros/pagamentos",
    messages: {
      created: `${parsed.data.name} cadastrada.`,
      updated: "Forma de pagamento atualizada.",
      unique: "Já existe uma forma de pagamento com esse nome.",
      fallback: "Não foi possível salvar.",
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { usernameToEmail } from "@/lib/auth/username";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { createAdminClient, createStatelessClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const base = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(3, "Informe o motivo.").max(500),
  password: z.string().min(1, "Confirme a sua senha.").max(72),
  /** Gerada ao abrir a janela: clicar duas vezes não aplica duas vezes. */
  key: z.uuid(),
});

const cancelSchema = base;
const returnSchema = base.extend({
  items: z
    .array(z.object({ order_item_id: z.uuid(), quantity: z.number().min(0).max(1_000_000) }))
    .min(1)
    .max(100),
});

/**
 * Confere a senha de quem está logado num cliente separado (sem trocar a sessão)
 * e limita as tentativas. A senha não é guardada nem registrada.
 */
async function confirmOwnPassword(
  user: { id: string; email: string | null; username: string },
  password: string,
): Promise<string | null> {
  const { data: allowed } = await createAdminClient().rpc("rate_limit_hit", {
    p_key: `confirmar-senha:${user.id}`,
    p_limit: 5,
    p_window_seconds: 900,
  });
  if (allowed === false) return "Muitas tentativas. Aguarde alguns minutos.";
  const verifier = createStatelessClient();
  const { error } = await verifier.auth.signInWithPassword({
    email: user.email ?? usernameToEmail(user.username),
    password,
  });
  if (error) return "Senha incorreta.";
  await verifier.auth.signOut({ scope: "local" });
  return null;
}

function revalidateSale(orderId: string) {
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/vendas");
  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/inicio");
}

/** Cancela a venda concluída: devolve ao estoque e estorna o que faltava. */
export async function cancelSale(input: unknown): Promise<ActionResult> {
  const { session } = await requireOrg("pedidos.cancelar");
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira." };
  const v = parsed.data;

  const wrong = await confirmOwnPassword(session, v.password);
  if (wrong) return { ok: false, error: wrong };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sale", {
    p_order: v.orderId,
    p_reason: v.reason,
    p_key: v.key,
  });
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível cancelar." }) };
  revalidateSale(v.orderId);
  return { ok: true, message: "Venda cancelada. Estoque e financeiro acertados." };
}

/** Devolução total ou parcial de itens da venda concluída. */
export async function returnSale(input: unknown): Promise<ActionResult> {
  const { session } = await requireOrg("pedidos.cancelar");
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira." };
  const v = parsed.data;
  const items = v.items.filter((i) => i.quantity > 0);
  if (items.length === 0)
    return { ok: false, error: "Informe a quantidade de pelo menos um item." };

  const wrong = await confirmOwnPassword(session, v.password);
  if (wrong) return { ok: false, error: wrong };

  const supabase = await createClient();
  const { error } = await supabase.rpc("return_sale", {
    p_order: v.orderId,
    p_items: items,
    p_reason: v.reason,
    p_key: v.key,
  });
  if (error)
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível registrar a devolução." }),
    };
  revalidateSale(v.orderId);
  return { ok: true, message: "Devolução registrada. Estoque e financeiro acertados." };
}

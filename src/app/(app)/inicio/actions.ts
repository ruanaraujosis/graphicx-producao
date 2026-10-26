"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { commissionSchema } from "./schema";

/** Define (ou tira) a comissão de uma pessoa da equipe. O RLS confere a permissão e a gráfica. */
export async function setCommission(userId: string, input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("financeiro.gerenciar");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, error: "Pessoa inválida." };
  const parsed = commissionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Comissão inválida." };

  const supabase = await createClient();
  const org = membership.organizationId;
  const { rate } = parsed.data;
  const { error } =
    rate === null
      ? await supabase
          .from("seller_commissions")
          .delete()
          .eq("organization_id", org)
          .eq("user_id", userId)
      : await supabase
          .from("seller_commissions")
          .upsert(
            { organization_id: org, user_id: userId, rate },
            { onConflict: "organization_id,user_id" },
          );
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  revalidatePath("/inicio");
  return {
    ok: true,
    message:
      rate === null ? "Comissão removida." : `Comissão de ${rate.toLocaleString("pt-BR")}% salva.`,
  };
}

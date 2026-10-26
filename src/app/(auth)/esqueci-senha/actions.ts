"use server";

import { emailSchema } from "@/lib/auth/username";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ResetRequestResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(email: string): Promise<ResetRequestResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: "Informe um e-mail válido." };

  const supabase = await createClient();
  const redirectTo = new URL(
    "/auth/confirm?next=/redefinir-senha",
    getPublicEnv().NEXT_PUBLIC_APP_URL,
  );
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: redirectTo.toString(),
  });

  if (error?.status === 429) {
    return { ok: false, error: "Muitos pedidos seguidos. Aguarde alguns minutos." };
  }
  // Sucesso mesmo se o e-mail não existir: não revela quem tem conta.
  return { ok: true };
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseLoginIdentifier, usernameToEmail } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

const INVALID = "E-mail/usuário ou senha incorretos.";

/** Descobre o e-mail de login a partir do usuário (nome.cargo). */
async function emailForUsername(username: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return usernameToEmail(username);
  return profile.email ?? usernameToEmail(username);
}

export async function login(input: z.input<typeof loginSchema>): Promise<LoginState> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: INVALID };

  const identifier = parseLoginIdentifier(parsed.data.identifier);
  const email =
    identifier.kind === "email" ? identifier.value : await emailForUsername(identifier.value);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.status === 429) {
      return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    }
    // Mesma mensagem para usuário inexistente e senha errada: não revela quem tem conta.
    return { error: INVALID };
  }

  // A DAL decide o próximo passo: MFA, escolha de gráfica ou direto para o painel.
  redirect(safeNextPath(parsed.data.next));
}

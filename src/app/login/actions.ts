"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseLoginIdentifier, usernameToEmail } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { recordAccess } from "@/lib/auth/access-log";
import { clientIp } from "@/lib/client-ip";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

const INVALID = "E-mail/usuário ou senha incorretos.";

/** Erros de senha permitidos por conta e por aparelho (IP) em 15 minutos. */
const LOGIN_LIMITS = { account: 5, ip: 20, windowSeconds: 15 * 60 } as const;

const BLOCKED =
  "Muitas tentativas de senha. Aguarde 15 minutos ou use “Esqueci minha senha” para criar uma nova.";

/** Chaves do limite: a conta (e-mail) e o IP de quem tenta. */
async function loginLimitKeys(email: string) {
  const ip = clientIp(await headers());
  return {
    account: `login:conta:${email.trim().toLowerCase()}`,
    ip: ip === "desconhecido" ? null : `login:ip:${ip}`,
  };
}

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

  // Limite de tentativas: barra antes de conferir a senha (mesma mensagem com ou sem conta).
  const admin = createAdminClient();
  const keys = await loginLimitKeys(email);
  const checks = [
    admin.rpc("rate_limit_blocked", {
      p_key: keys.account,
      p_limit: LOGIN_LIMITS.account,
      p_window_seconds: LOGIN_LIMITS.windowSeconds,
    }),
  ];
  if (keys.ip) {
    checks.push(
      admin.rpc("rate_limit_blocked", {
        p_key: keys.ip,
        p_limit: LOGIN_LIMITS.ip,
        p_window_seconds: LOGIN_LIMITS.windowSeconds,
      }),
    );
  }
  if ((await Promise.all(checks)).some((r) => r.data === true)) return { error: BLOCKED };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.status === 429) {
      return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
    }
    // Conta o erro na conta e no IP.
    await Promise.all(
      [keys.account, keys.ip]
        .filter((k): k is string => Boolean(k))
        .map((key) =>
          admin.rpc("rate_limit_hit", {
            p_key: key,
            p_limit: key === keys.account ? LOGIN_LIMITS.account : LOGIN_LIMITS.ip,
            p_window_seconds: LOGIN_LIMITS.windowSeconds,
          }),
        ),
    );
    // Mesma mensagem para usuário inexistente e senha errada: não revela quem tem conta.
    return { error: INVALID };
  }

  // Entrou: zera os erros da conta.
  await admin.rpc("rate_limit_reset", { p_key: keys.account });

  await recordAccess(data.user.id, "login");

  // A DAL decide o próximo passo: MFA, escolha de gráfica ou direto para o painel.
  redirect(safeNextPath(parsed.data.next));
}

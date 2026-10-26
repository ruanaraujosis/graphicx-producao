"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

export type EnrollmentResult =
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: string };

/** Começa o cadastro do app autenticador: gera o QR code. */
export async function startEnrollment(): Promise<EnrollmentResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // Cadastros abandonados no meio impedem um novo; limpa os não confirmados.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "GraphicX",
    friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data)
    return { ok: false, error: "Não foi possível iniciar o cadastro. Tente de novo." };

  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const verifySchema = z.object({
  factorId: z.uuid(),
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().length(6, "O código tem 6 dígitos.")),
  next: z.string().optional(),
});

/** Confere o código de 6 dígitos (no cadastro ou a cada login) e eleva a sessão para aal2. */
export async function verifyCode(input: z.input<typeof verifySchema>): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    if (error.status === 429) return { error: "Muitas tentativas. Aguarde um pouco." };
    return { error: "Código inválido ou expirado. Confira o horário do celular e tente de novo." };
  }

  redirect(safeNextPath(parsed.data.next));
}

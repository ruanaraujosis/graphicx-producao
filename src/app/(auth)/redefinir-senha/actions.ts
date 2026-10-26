"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/dal";
import { clearMustChangePassword } from "@/lib/auth/people";
import { safeNextPath } from "@/lib/auth/safe-next";
import { passwordSchema } from "@/lib/auth/username";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
    /** Tela de origem, para voltar a ela se o MFA for exigido no meio do caminho. */
    from: z.enum(["/redefinir-senha", "/criar-senha"]).default("/redefinir-senha"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

/** Usada pelo link de "Esqueci minha senha" e pela senha provisória do 1º acesso. */
export async function setNewPassword(input: z.input<typeof schema>): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) redirect("/login?erro=link-invalido");

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    // Conta com MFA: o Supabase exige o segundo fator antes de trocar a senha.
    if (error.code === "insufficient_aal") redirect(`/mfa?next=${parsed.data.from}`);
    if (error.code === "same_password") {
      return { error: "Use uma senha diferente da provisória/anterior." };
    }
    return { error: "Não foi possível salvar. Tente uma senha mais forte." };
  }

  // A senha agora é da própria pessoa: deixa de ser provisória.
  if (session.mustChangePassword) await clearMustChangePassword(session.id);

  redirect(safeNextPath("/inicio"));
}

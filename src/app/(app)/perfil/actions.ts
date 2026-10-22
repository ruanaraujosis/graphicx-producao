"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { passwordSchema, usernameToEmail } from "@/lib/auth/username";
import { createStatelessClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const nameSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
});

export async function updateOwnName(input: z.input<typeof nameSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível salvar o nome." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Nome atualizado." };
}

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "A nova senha precisa ser diferente da atual.",
  });

export async function changeOwnPassword(
  input: z.input<typeof passwordChangeSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Confere a senha atual num cliente separado, sem mexer na sessão do navegador.
  const verifier = createStatelessClient();
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email ?? usernameToEmail(user.username),
    password: parsed.data.currentPassword,
  });
  if (verifyError) return { ok: false, error: "Senha atual incorreta." };
  await verifier.auth.signOut();

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error)
    return { ok: false, error: "Não foi possível trocar a senha. Tente uma senha mais forte." };

  return { ok: true, message: "Senha alterada com sucesso." };
}

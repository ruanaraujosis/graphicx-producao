import { z } from "zod";
import { emailSchema, passwordSchema, usernameSchema } from "@/lib/auth/username";

const fullName = z.string().trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo.");
const roleId = z.uuid({ error: "Escolha o perfil de acesso." });
const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(emailSchema.optional());

export const createMemberSchema = z
  .object({
    fullName,
    username: usernameSchema,
    email: optionalEmail,
    roleId,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export const updateMemberSchema = z.object({
  userId: z.uuid(),
  fullName,
  roleId,
  active: z.boolean(),
});

export const resetPasswordSchema = z
  .object({
    userId: z.uuid(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export type CreateMemberInput = z.input<typeof createMemberSchema>;
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

import { z } from "zod";

/**
 * Cada pessoa tem um usuário `nome.cargo` único na plataforma e, opcionalmente,
 * um e-mail real. Quem não tem e-mail recebe no Supabase Auth um e-mail interno
 * derivado do usuário, que nunca é exibido nem recebe mensagens.
 */
export const INTERNAL_EMAIL_DOMAIN = "usuarios.smart.local";

const USERNAME_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)+$/;

/** Normaliza o que a pessoa digitou: minúsculas, sem acento e sem espaços. */
export function normalizeUsername(raw: string) {
  return raw.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, "");
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "Usuário muito curto.")
      .max(60, "Usuário muito longo.")
      .regex(USERNAME_PATTERN, "Use o formato nome.cargo (ex.: joao.producao)."),
  );

export function usernameToEmail(username: string) {
  return `${normalizeUsername(username)}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string) {
  const suffix = `@${INTERNAL_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : null;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido."))
  .refine((email) => !email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`), "E-mail inválido.");

/** O campo único do login aceita e-mail ou usuário. */
export function parseLoginIdentifier(raw: string) {
  const value = raw.trim();
  if (value.includes("@")) return { kind: "email" as const, value: value.toLowerCase() };
  return { kind: "username" as const, value: normalizeUsername(value) };
}

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(72, "A senha pode ter no máximo 72 caracteres.");

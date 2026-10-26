import { z } from "zod";

/**
 * Variáveis públicas: o Next.js só embute no bundle do navegador acessos
 * literais a `process.env.NEXT_PUBLIC_*`, por isso são lidas uma a uma.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL inválida."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "Defina NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export function getPublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });
  if (!parsed.success) {
    throw new Error(
      `Variáveis de ambiente públicas ausentes ou inválidas (veja .env.example): ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

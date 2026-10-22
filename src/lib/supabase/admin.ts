import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente com a chave secreta: ignora o RLS. Usar só em Server Actions e
 * Route Handlers, depois de verificar o perfil de quem chamou, e só para o
 * que o cliente comum não consegue fazer (ex.: criar usuários no Auth).
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY não definida (veja .env.example).");
  }
  return createClient<Database>(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente descartável, sem cookies, para conferir uma senha sem trocar a sessão atual. */
export function createStatelessClient() {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

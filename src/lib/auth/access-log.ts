import "server-only";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Registro de acesso (Marco Civil, art. 15): data, hora, IP e navegador de cada entrada, guardados
 * por 6 meses (a limpeza roda no banco). Falha ao gravar não impede o login.
 */
export async function recordAccess(userId: string, event: "login" | "link") {
  try {
    const h = await headers();
    const ip = clientIp(h);
    const { error } = await createAdminClient()
      .from("access_logs")
      .insert({
        user_id: userId,
        event,
        ip: ip === "desconhecido" ? null : ip,
        user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
      });
    if (error) console.error("Registro de acesso:", error.message);
  } catch (e) {
    console.error("Registro de acesso:", e instanceof Error ? e.message : e);
  }
}

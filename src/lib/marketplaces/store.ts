import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { refreshTokens } from "./shopee/auth";
import type { CallLog, ShopCredentials } from "./shopee/client";
import { requireShopeeConfig } from "./shopee/config";

export type ShopRow = Database["public"]["Tables"]["marketplace_shops"]["Row"];

/**
 * Acesso do servidor às integrações (chave secreta). Usar só em rotas e tarefas
 * que já validaram quem chamou (sessão + permissão, assinatura do aviso ou
 * segredo do processador).
 */
export function admin() {
  return createAdminClient();
}

/** Registra uma chamada (só metadados) para a tela de saúde. */
export function logger(
  shop: Pick<ShopRow, "id" | "organization_id">,
  direction: "saida" | "entrada" = "saida",
) {
  const db = admin();
  return (log: CallLog) => {
    void db.from("marketplace_logs").insert({
      organization_id: shop.organization_id,
      shop_id: shop.id,
      direction,
      endpoint: log.endpoint.slice(0, 200),
      ok: log.ok,
      status_code: log.statusCode,
      duration_ms: log.durationMs,
      request_id: log.requestId,
      error: log.error,
    });
  };
}

export async function loadShop(shopId: string) {
  const { data } = await admin()
    .from("marketplace_shops")
    .select("*")
    .eq("id", shopId)
    .maybeSingle();
  return data;
}

/**
 * Credenciais válidas da loja: renova o access_token quando falta pouco para
 * vencer (ou quando `force`). Marca a loja como expirada se a renovação falhar
 * por autorização (o dono precisa conectar de novo).
 */
export async function shopCredentials(shop: ShopRow, force = false): Promise<ShopCredentials> {
  const db = admin();
  const { data } = await db.rpc("marketplace_get_tokens", { p_shop: shop.id }).maybeSingle();
  if (!data?.access_token || !data.refresh_token) {
    throw new Error("Loja sem autorização. Conecte de novo em Configurações → Integrações.");
  }
  const shopId = Number(shop.external_shop_id);
  const expires = data.access_expires_at ? new Date(data.access_expires_at).getTime() : 0;
  if (!force && expires - Date.now() > 5 * 60_000) {
    return { shopId, accessToken: data.access_token };
  }
  try {
    const tokens = await refreshTokens(requireShopeeConfig(), data.refresh_token, shopId, {
      onLog: logger(shop),
    });
    await db.rpc("marketplace_save_tokens", {
      p_shop: shop.id,
      p_access: tokens.accessToken,
      p_refresh: tokens.refreshToken,
      p_access_expires: tokens.accessExpiresAt.toISOString(),
      p_refresh_expires: tokens.refreshExpiresAt.toISOString(),
    });
    return { shopId, accessToken: tokens.accessToken };
  } catch (e) {
    await db
      .from("marketplace_shops")
      .update({
        status: "expirada",
        last_error:
          "A autorização da loja expirou. Conecte de novo em Configurações → Integrações.",
      })
      .eq("id", shop.id);
    throw e;
  }
}

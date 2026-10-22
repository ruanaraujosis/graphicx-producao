import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { MARKETPLACE_STATE_COOKIE, checkOAuthState } from "@/lib/marketplaces/oauth";
import { exchangeCode, getShopInfo } from "@/lib/marketplaces/shopee/auth";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { admin, logger } from "@/lib/marketplaces/store";
import { createClient } from "@/lib/supabase/server";

/** Volta da Shopee: confere o estado, troca o código pelos tokens e registra a loja. */
export async function GET(request: NextRequest) {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const back = new URL("/configuracoes/integracoes", request.nextUrl.origin);
  const fail = (code: string) => {
    back.searchParams.set("erro", code);
    return NextResponse.redirect(back);
  };

  const jar = await cookies();
  const saved = jar.get(MARKETPLACE_STATE_COOKIE)?.value;
  jar.delete({ name: MARKETPLACE_STATE_COOKIE, path: "/api/marketplaces" });
  if (
    !checkOAuthState(saved, request.nextUrl.searchParams.get("state"), membership.organizationId)
  ) {
    return fail("estado");
  }

  const config = getShopeeConfig();
  const code = request.nextUrl.searchParams.get("code");
  const shopId = Number(request.nextUrl.searchParams.get("shop_id"));
  if (!config) return fail("config");
  if (!code || !Number.isInteger(shopId) || shopId <= 0) return fail("autorizacao");

  const db = admin();
  const { data: existing } = await db
    .from("marketplace_shops")
    .select("id, organization_id")
    .eq("marketplace", "shopee")
    .eq("external_shop_id", String(shopId))
    .maybeSingle();
  if (existing && existing.organization_id !== membership.organizationId)
    return fail("outra-grafica");

  let shopRowId = existing?.id;
  if (!shopRowId) {
    // Gravado com a sessão de quem conectou: o RLS confere a permissão e a auditoria registra o autor.
    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("marketplace_shops")
      .insert({
        organization_id: membership.organizationId,
        marketplace: "shopee",
        external_shop_id: String(shopId),
      })
      .select("id")
      .single();
    if (error || !created) return fail("salvar");
    shopRowId = created.id;
  }
  const shopRef = { id: shopRowId, organization_id: membership.organizationId };

  try {
    const tokens = await exchangeCode(config, code, shopId, { onLog: logger(shopRef) });
    const { error } = await db.rpc("marketplace_save_tokens", {
      p_shop: shopRowId,
      p_access: tokens.accessToken,
      p_refresh: tokens.refreshToken,
      p_access_expires: tokens.accessExpiresAt.toISOString(),
      p_refresh_expires: tokens.refreshExpiresAt.toISOString(),
    });
    if (error) return fail("salvar");
    const info = await getShopInfo(
      config,
      { shopId, accessToken: tokens.accessToken },
      { onLog: logger(shopRef) },
    ).catch(() => null);
    if (info) {
      await db
        .from("marketplace_shops")
        .update({ name: info.name, region: info.region })
        .eq("id", shopRowId);
    }
    // Primeiras tarefas: trazer os anúncios e os pedidos recentes.
    await db.rpc("marketplace_enqueue", {
      p_shop: shopRowId,
      p_kind: "listings.import",
      p_dedupe: "listings.import",
    });
    await db.rpc("marketplace_enqueue", {
      p_shop: shopRowId,
      p_kind: "orders.reconcile",
      p_dedupe: "reconcile",
    });
  } catch {
    return fail("autorizacao");
  }

  back.searchParams.set("conectada", "1");
  return NextResponse.redirect(back);
}

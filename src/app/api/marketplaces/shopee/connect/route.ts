import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { MARKETPLACE_STATE_COOKIE } from "@/lib/marketplaces/oauth";
import { authorizationUrl } from "@/lib/marketplaces/shopee/auth";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";

/** Leva o dono da gráfica à página da Shopee para autorizar a GraphicX. */
export async function GET(request: NextRequest) {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const back = new URL("/configuracoes/integracoes", request.nextUrl.origin);
  const config = getShopeeConfig();
  if (!config) {
    back.searchParams.set("erro", "config");
    return NextResponse.redirect(back);
  }

  // Estado aleatório amarrado à gráfica: impede que alguém "cole" a loja dele em outra conta.
  const nonce = randomBytes(24).toString("base64url");
  (await cookies()).set(MARKETPLACE_STATE_COOKIE, `${nonce}.${membership.organizationId}`, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/marketplaces",
    maxAge: 600,
  });
  const callback = new URL("/api/marketplaces/shopee/callback", request.nextUrl.origin);
  callback.searchParams.set("state", nonce);
  return NextResponse.redirect(authorizationUrl(config, callback.toString()));
}

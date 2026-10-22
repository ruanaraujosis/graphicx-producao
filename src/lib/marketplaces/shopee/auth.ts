import type { ShopeeConfig } from "./config";
import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import { signRequest } from "./sign";

/** Validade do refresh_token na Shopee (30 dias). */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ShopeeTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

/** Endereço da página da Shopee onde o dono da loja autoriza a GraphicX. */
export function authorizationUrl(config: ShopeeConfig, redirect: string, now = Date.now()) {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(now / 1000);
  const url = new URL(config.host + path);
  url.searchParams.set("partner_id", String(config.partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set(
    "sign",
    signRequest({ partnerKey: config.partnerKey, partnerId: config.partnerId, path, timestamp }),
  );
  url.searchParams.set("redirect", redirect);
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token: string; expire_in: number };

function toTokens(r: TokenResponse, now: number): ShopeeTokens {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    accessExpiresAt: new Date(now + r.expire_in * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
  };
}

/** Troca o código recebido no retorno da autorização pelos tokens da loja. */
export async function exchangeCode(
  config: ShopeeConfig,
  code: string,
  shopId: number,
  opts: { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number } = {},
) {
  const r = await shopeeRequest<TokenResponse>({
    config,
    path: "/api/v2/auth/token/get",
    method: "POST",
    body: { code, shop_id: shopId, partner_id: config.partnerId },
    ...opts,
  });
  return toTokens(r, opts.now?.() ?? Date.now());
}

/** Renova o access_token (vale 4 horas) usando o refresh_token. */
export async function refreshTokens(
  config: ShopeeConfig,
  refreshToken: string,
  shopId: number,
  opts: { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number } = {},
) {
  const r = await shopeeRequest<TokenResponse>({
    config,
    path: "/api/v2/auth/access_token/get",
    method: "POST",
    body: { refresh_token: refreshToken, shop_id: shopId, partner_id: config.partnerId },
    ...opts,
  });
  return toTokens(r, opts.now?.() ?? Date.now());
}

/** Nome e região da loja, para mostrar na tela de integrações. */
export async function getShopInfo(
  config: ShopeeConfig,
  shop: ShopCredentials,
  opts: { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch } = {},
) {
  const r = await shopeeRequest<{ shop_name?: string; region?: string }>({
    config,
    path: "/api/v2/shop/get_shop_info",
    shop,
    ...opts,
  });
  return { name: r.shop_name ?? null, region: r.region ?? null };
}

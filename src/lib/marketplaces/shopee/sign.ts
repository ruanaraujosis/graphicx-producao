import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura das chamadas da Shopee Open Platform v2 (HMAC-SHA256, hex):
 * - chamadas públicas (autorização): partner_id + caminho + timestamp
 * - chamadas da loja: partner_id + caminho + timestamp + access_token + shop_id
 */
export function signRequest(input: {
  partnerKey: string;
  partnerId: number;
  path: string;
  timestamp: number;
  accessToken?: string;
  shopId?: number | string;
}) {
  const base = `${input.partnerId}${input.path}${input.timestamp}${input.accessToken ?? ""}${input.shopId ?? ""}`;
  return createHmac("sha256", input.partnerKey).update(base).digest("hex");
}

/**
 * Confere o aviso (push) recebido: o cabeçalho Authorization traz
 * HMAC-SHA256(partner_key, url_de_retorno + "|" + corpo_cru).
 */
export function verifyPushSignature(input: {
  partnerKey: string;
  url: string;
  rawBody: string;
  authorization: string | null;
}) {
  if (!input.authorization) return false;
  const expected = createHmac("sha256", input.partnerKey)
    .update(`${input.url}|${input.rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.authorization.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

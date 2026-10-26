import "server-only";
/**
 * Credenciais do app da GraphicX na Shopee Open Platform (uma só para todas as
 * gráficas). Ficam só nas variáveis de ambiente da Vercel — nunca no código.
 *   SHOPEE_PARTNER_ID  número do app
 *   SHOPEE_PARTNER_KEY chave do app (segredo)
 *   SHOPEE_ENV         "sandbox" (padrão) ou "producao"
 *   SHOPEE_API_HOST    opcional: sobrescreve o endereço da API
 */
export type ShopeeConfig = {
  partnerId: number;
  partnerKey: string;
  host: string;
  sandbox: boolean;
};

const HOSTS = {
  producao: "https://partner.shopeemobile.com",
  sandbox: "https://openplatform.sandbox.test-stable.shopee.sg",
} as const;

/** Configuração da Shopee, ou null se o app ainda não foi cadastrado. */
export function getShopeeConfig(): ShopeeConfig | null {
  const id = Number(process.env.SHOPEE_PARTNER_ID?.trim());
  const key = process.env.SHOPEE_PARTNER_KEY?.trim();
  if (!Number.isInteger(id) || id <= 0 || !key) return null;
  const sandbox = process.env.SHOPEE_ENV?.trim() !== "producao";
  const host = process.env.SHOPEE_API_HOST?.trim() || (sandbox ? HOSTS.sandbox : HOSTS.producao);
  return { partnerId: id, partnerKey: key, host: host.replace(/\/+$/, ""), sandbox };
}

export function requireShopeeConfig(): ShopeeConfig {
  const config = getShopeeConfig();
  if (!config)
    throw new Error("Integração com a Shopee ainda não configurada (credenciais do app).");
  return config;
}

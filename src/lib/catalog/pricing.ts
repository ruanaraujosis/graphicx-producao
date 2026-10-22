/**
 * Preço por canal: preço base da variação + ajuste % do canal, ou um preço manual
 * que substitui a regra. Mesma regra de `public.variant_price()` no banco (há teste).
 */

/** Canais de venda (a GraphicX integra só a Shopee como marketplace). */
export const SALES_CHANNELS = ["balcao", "shopee", "whatsapp"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const CHANNEL_LABELS: Record<SalesChannel, string> = {
  balcao: "Balcão",
  shopee: "Shopee",
  whatsapp: "WhatsApp",
};

/** Arredonda para centavos como o `round(x, 2)` do Postgres (meio para longe do zero). */
export function roundCents(value: number) {
  return (Math.sign(value) * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

export function channelPrice(input: {
  basePrice: number;
  adjustmentPct?: number | null;
  override?: number | null;
}) {
  if (input.override !== null && input.override !== undefined) return roundCents(input.override);
  return roundCents(input.basePrice * (1 + (input.adjustmentPct ?? 0) / 100));
}

/** Margem bruta sobre o preço de venda, em % (custo dos insumos vs preço). */
export function grossMarginPct(price: number, cost: number) {
  if (price <= 0) return null;
  return roundCents(((price - cost) / price) * 100);
}

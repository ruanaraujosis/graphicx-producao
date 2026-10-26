import "server-only";
import { SALES_CHANNELS, channelPrice, type SalesChannel } from "@/lib/catalog/pricing";
import { createClient } from "@/lib/supabase/server";

export type VariantOption = {
  id: string;
  label: string;
  sku: string;
  productName: string;
  fulfillment: "sob_encomenda" | "pronta_entrega";
  productionDays: number;
  available: number | null;
  prices: Record<SalesChannel, number>;
};

export type PaymentOption = { value: string; label: string };

/** Variações ativas com o preço de cada canal, para montar os itens do pedido. */
export async function loadOrderFormOptions(org: string) {
  const supabase = await createClient();
  const [variantsRes, rulesRes, paymentsRes, availabilityRes] = await Promise.all([
    supabase
      .from("product_variants")
      .select(
        "id, sku, name, base_price, products!inner(name, fulfillment, production_days, active), variant_channel_prices(channel, price)",
      )
      .eq("organization_id", org)
      .eq("active", true)
      .eq("products.active", true)
      .order("sku"),
    supabase
      .from("channel_price_rules")
      .select("channel, adjustment_pct")
      .eq("organization_id", org),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", org)
      .eq("active", true)
      .order("name"),
    supabase
      .from("variant_availability")
      .select("variant_id, available_units, bom_items, fulfillment")
      .eq("organization_id", org),
  ]);

  for (const [name, res] of Object.entries({
    variantsRes,
    rulesRes,
    paymentsRes,
    availabilityRes,
  })) {
    if (res.error) console.error(`[pedidos] falha ao carregar ${name}:`, res.error.message);
  }

  const rules = Object.fromEntries(SALES_CHANNELS.map((c) => [c, 0])) as Record<
    SalesChannel,
    number
  >;
  for (const r of rulesRes.data ?? []) rules[r.channel] = r.adjustment_pct;
  const availability = new Map(
    (availabilityRes.data ?? []).map((a) => [
      a.variant_id,
      // Sob encomenda sem ficha técnica: não dá para saber quanto há.
      a.fulfillment === "sob_encomenda" && a.bom_items === 0 ? null : a.available_units,
    ]),
  );

  const variants: VariantOption[] = (variantsRes.data ?? []).map((v) => {
    const overrides = new Map(v.variant_channel_prices.map((p) => [p.channel, p.price]));
    return {
      id: v.id,
      sku: v.sku,
      label: `${v.products.name} — ${v.name}`,
      productName: v.products.name,
      fulfillment: v.products.fulfillment,
      productionDays: v.products.production_days,
      available: availability.get(v.id) ?? null,
      prices: Object.fromEntries(
        SALES_CHANNELS.map((c) => [
          c,
          channelPrice({
            basePrice: v.base_price,
            adjustmentPct: rules[c],
            override: overrides.get(c) ?? null,
          }),
        ]),
      ) as Record<SalesChannel, number>,
    };
  });

  const payments: PaymentOption[] = (paymentsRes.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return { variants, payments };
}

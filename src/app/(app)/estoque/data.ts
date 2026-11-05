import "server-only";
import { createClient } from "@/lib/supabase/server";
import { UNIT_SHORT, type Unit } from "@/lib/stock/units";

export type StockItemOption = { value: string; label: string; hint?: string; onHand: number };

/** Opções dos diálogos de estoque: insumos e variações (com e sem ficha técnica), com o saldo. */
export async function stockDialogOptions(organizationId: string) {
  const supabase = await createClient();
  const [{ data: materials }, { data: variants }, { data: balances }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, sku, unit")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("product_variants")
      .select("id, sku, name, products(name, fulfillment), bom_items(material_id)")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("sku"),
    supabase
      .from("stock_balances")
      .select("material_id, variant_id, on_hand")
      .eq("organization_id", organizationId),
  ]);
  const onHand = new Map(
    (balances ?? []).map((b) => [b.material_id ?? b.variant_id, Number(b.on_hand)]),
  );

  const items: StockItemOption[] = [
    ...(materials ?? []).map((m) => ({
      value: `material:${m.id}`,
      label: `Insumo · ${m.name} (${UNIT_SHORT[m.unit as Unit] ?? m.unit})`,
      hint: m.sku ?? undefined,
      onHand: onHand.get(m.id) ?? 0,
    })),
    ...(variants ?? [])
      .filter((v) => v.products?.fulfillment === "pronta_entrega")
      .map((v) => ({
        value: `variant:${v.id}`,
        label: `Pronto · ${v.products?.name ?? ""} — ${v.sku}`,
        hint: v.name,
        onHand: onHand.get(v.id) ?? 0,
      })),
  ];
  const consumable = (variants ?? [])
    .filter((v) => v.bom_items.length > 0)
    .map((v) => ({
      value: v.id,
      label: `${v.products?.name ?? ""} — ${v.sku} (${v.name})`,
    }));

  return { items, consumable };
}

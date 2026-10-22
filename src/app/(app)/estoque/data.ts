import "server-only";
import { createClient } from "@/lib/supabase/server";
import { UNIT_SHORT, type Unit } from "@/lib/stock/units";

/** Opções dos diálogos de estoque: insumos e variações (com e sem ficha técnica). */
export async function stockDialogOptions(organizationId: string) {
  const supabase = await createClient();
  const [{ data: materials }, { data: variants }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, name, unit")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("product_variants")
      .select("id, sku, name, products(name, fulfillment), bom_items(material_id)")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("sku"),
  ]);

  const items = [
    ...(materials ?? []).map((m) => ({
      value: `material:${m.id}`,
      label: `Insumo · ${m.name} (${UNIT_SHORT[m.unit as Unit] ?? m.unit})`,
    })),
    ...(variants ?? [])
      .filter((v) => v.products?.fulfillment === "pronta_entrega")
      .map((v) => ({
        value: `variant:${v.id}`,
        label: `Pronto · ${v.products?.name ?? ""} — ${v.sku}`,
      })),
  ];
  const consumable = (variants ?? [])
    .filter((v) => v.bom_items.length > 0)
    .map((v) => ({ value: v.id, label: `${v.products?.name ?? ""} — ${v.sku} (${v.name})` }));

  return { items, consumable };
}

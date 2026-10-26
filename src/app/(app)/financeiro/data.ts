import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Opções dos formulários de contas a pagar. */
export async function payableOptions(org: string) {
  const supabase = await createClient();
  const [suppliers, categories] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org)
      .eq("active", true)
      .order("name"),
    supabase
      .from("expense_categories")
      .select("id, name, active")
      .eq("organization_id", org)
      .order("name"),
  ]);
  return {
    suppliers: (suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    categoryOptions: (categories.data ?? [])
      .filter((c) => c.active)
      .map((c) => ({ value: c.id, label: c.name })),
    categories: categories.data ?? [],
  };
}

/** Faturamento confirmado desde uma data (competência), agrupado por dia. */
export async function revenueSince(org: string, fromIso: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("total, confirmed_at")
    .eq("organization_id", org)
    .not("status", "in", "(orcamento,cancelado)")
    .gte("confirmed_at", `${fromIso}T00:00:00-03:00`)
    .limit(10000);
  return (data ?? []).map((o) => ({
    total: o.total,
    // Dia em São Paulo.
    day: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(o.confirmed_at!),
    ),
  }));
}

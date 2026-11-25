import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadOrderFormOptions } from "../../pedidos/data";
import { SaleForm } from "./sale-form";

export const metadata = { title: "Nova venda" };

export default function NovaVendaPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/vendas" label="Vendas" />
      <PageHeader
        title="Nova venda"
        description="Balcão ou WhatsApp: bipe ou busque os produtos, finalize e o estoque é baixado na hora."
      />
      <Suspense fallback={<ListSkeleton />}>
        <NovaVenda />
      </Suspense>
    </div>
  );
}

async function NovaVenda() {
  const { session, membership } = await requireOrg(["pedidos.gerenciar", "vendas.gerenciar"]);
  const org = membership.organizationId;
  const supabase = await createClient();
  const [{ variants, payments }, settingsRes, membersRes] = await Promise.all([
    loadOrderFormOptions(org),
    supabase.from("sales_settings").select("*").eq("organization_id", org).maybeSingle(),
    supabase
      .from("organization_members")
      .select("user_id, profiles(full_name)")
      .eq("organization_id", org)
      .eq("active", true),
  ]);

  const s = settingsRes.data;
  const sellers = (membersRes.data ?? [])
    .filter((m) => m.profiles)
    .map((m) => ({ value: m.user_id, label: m.profiles?.full_name ?? "" }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <SaleForm
      variants={variants}
      payments={payments}
      sellers={sellers}
      currentUserId={session.id}
      canDiscount={can(membership.permissions, "vendas.gerenciar")}
      canEditRecipePrice={can(membership.permissions, "pedidos.alterar_preco")}
      settings={{
        sellerMaxDiscount: s?.seller_max_discount ?? 15,
        managerMaxDiscount: s?.manager_max_discount ?? 30,
        requirePaymentMethod: s?.require_payment_method ?? false,
        warnOverdue: s?.warn_overdue_receivables ?? true,
        defaultNote: s?.default_note ?? "",
      }}
    />
  );
}

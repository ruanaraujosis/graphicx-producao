import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { SalesSettingsForm } from "./settings-form";

export const metadata = { title: "Pedido de venda" };

export default function VendasConfigPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes" label="Configurações" />
      <PageHeader
        title="Pedido de venda"
        description="Limites de desconto, avisos e o que sai impresso no pedido de venda."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { membership } = await requireOrg("configuracoes.ver");
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("sales_settings")
    .select("*")
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  return (
    <SalesSettingsForm
      canManage={can(membership.permissions, "configuracoes.gerenciar")}
      initial={{
        seller_max_discount: s?.seller_max_discount ?? 15,
        manager_max_discount: s?.manager_max_discount ?? 30,
        require_payment_method: s?.require_payment_method ?? false,
        warn_overdue_receivables: s?.warn_overdue_receivables ?? true,
        tag_first_purchase: s?.tag_first_purchase ?? true,
        warn_incomplete_address: s?.warn_incomplete_address ?? true,
        default_note: s?.default_note ?? "",
        print_code: s?.print_code === "barras" ? "barras" : "qr",
        print_product_images: s?.print_product_images ?? false,
        print_item_order:
          s?.print_item_order === "sku" || s?.print_item_order === "descricao"
            ? s.print_item_order
            : "inclusao",
      }}
    />
  );
}

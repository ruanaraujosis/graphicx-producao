import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { SALES_CHANNELS, type SalesChannel } from "@/lib/catalog/pricing";
import { createClient } from "@/lib/supabase/server";
import { ChannelRulesForm } from "./rules-form";

export const metadata = { title: "Preços por canal" };

export default function PrecosPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <PageHeader
        title="Preços por canal"
        description="Cada variação tem um preço base. Aqui você define quanto somar (ou descontar) em cada canal — por exemplo, +20% na Shopee para cobrir as taxas. Dá para colocar um preço manual em uma variação específica na tela do produto."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Rules />
      </Suspense>
    </div>
  );
}

async function Rules() {
  const { membership } = await requireOrg("cadastros.ver");
  const supabase = await createClient();
  const { data } = await supabase
    .from("channel_price_rules")
    .select("channel, adjustment_pct")
    .eq("organization_id", membership.organizationId);
  const initial = Object.fromEntries(SALES_CHANNELS.map((c) => [c, 0])) as Record<
    SalesChannel,
    number
  >;
  for (const row of data ?? []) initial[row.channel] = row.adjustment_pct;

  return (
    <ChannelRulesForm
      initial={initial}
      canManage={can(membership.permissions, "cadastros.gerenciar")}
    />
  );
}

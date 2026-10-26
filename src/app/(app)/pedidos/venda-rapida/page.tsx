import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { loadOrderFormOptions } from "../data";
import { QuickSale } from "./quick-sale";

export const metadata = { title: "Venda rápida" };

export default function VendaRapidaPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/pedidos" label="Pedidos" />
      <PageHeader
        title="Venda rápida"
        description="Balcão: bipe ou busque os produtos, finalize e o estoque é baixado na hora."
      />
      <Suspense fallback={<ListSkeleton />}>
        <VendaRapida />
      </Suspense>
    </div>
  );
}

async function VendaRapida() {
  const { membership } = await requireOrg("pedidos.gerenciar");
  const { variants, payments } = await loadOrderFormOptions(membership.organizationId);
  return <QuickSale variants={variants} payments={payments} />;
}

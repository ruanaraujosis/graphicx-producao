import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { loadOrderFormOptions } from "../data";
import { OrderForm } from "../order-form";

export const metadata = { title: "Novo pedido" };

export default function NovoPedidoPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/pedidos" label="Pedidos" />
      <PageHeader
        title="Novo pedido"
        description="Balcão, WhatsApp ou orçamento. Pedidos da Shopee chegam sozinhos pela integração."
      />
      <Suspense fallback={<ListSkeleton />}>
        <NovoPedido />
      </Suspense>
    </div>
  );
}

async function NovoPedido() {
  const { membership } = await requireOrg("pedidos.gerenciar");
  const { variants, payments } = await loadOrderFormOptions(membership.organizationId);
  return <OrderForm variants={variants} payments={payments} />;
}

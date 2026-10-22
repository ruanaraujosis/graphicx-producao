import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { loadOrderFormOptions } from "../../data";
import { OrderForm } from "../../order-form";

export const metadata = { title: "Editar pedido" };

export default function EditarPedidoPage({ params }: PageProps<"/pedidos/[id]/editar">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EditarPedido params={params} />
    </Suspense>
  );
}

async function EditarPedido({ params }: { params: PageProps<"/pedidos/[id]/editar">["params"] }) {
  const { id } = await params;
  const { membership } = await requireOrg("pedidos.gerenciar");
  const supabase = await createClient();
  const [{ data: order }, options] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, number, status, channel, customer_id, customer_name, customer_phone, needs_art, due_date, payment_method_id, discount, shipping, notes, order_items(id, variant_id, description, quantity, unit_price, stock_state, position)",
      )
      .eq("id", id)
      .eq("organization_id", membership.organizationId)
      .maybeSingle(),
    loadOrderFormOptions(membership.organizationId),
  ]);
  if (!order) notFound();

  const items = [...order.order_items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      id: i.id,
      variant_id: i.variant_id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      locked: i.stock_state === "baixado",
    }));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/pedidos/${order.id}`} label={`Pedido ${orderNumber(order.number)}`} />
      <PageHeader title={`Editar pedido ${orderNumber(order.number)}`} />
      <OrderForm
        variants={options.variants}
        payments={options.payments}
        initial={{
          id: order.id,
          channel: order.channel,
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          needs_art: order.needs_art,
          due_date: order.due_date,
          payment_method_id: order.payment_method_id,
          discount: order.discount,
          shipping: order.shipping,
          notes: order.notes,
          items,
        }}
      />
    </div>
  );
}

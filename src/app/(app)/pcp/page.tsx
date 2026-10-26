import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { addDays, todayIso } from "@/lib/orders/deadline";
import { BOARD_STATUSES } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { Board, type BoardOrder } from "./board";

export const metadata = { title: "Produção" };

export default function PcpPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Produção"
        description="Quadro em tempo real, ordenado pela data limite de postagem."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Quadro />
      </Suspense>
    </div>
  );
}

async function Quadro() {
  const { membership } = await requireOrg("pcp.ver");
  const supabase = await createClient();
  // Enviados/entregues só da última semana, para o quadro não crescer sem fim.
  const weekAgo = `${addDays(todayIso(), -7)}T00:00:00-03:00`;
  const { data } = await supabase
    .from("orders")
    .select(
      "id, number, status, channel, customer_name, due_date, needs_art, status_changed_at, order_items(description, quantity)",
    )
    .eq("organization_id", membership.organizationId)
    .in("status", BOARD_STATUSES)
    .or(`status.not.in.(enviado,entregue),status_changed_at.gte.${weekAgo}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("number")
    .limit(500);

  const orders: BoardOrder[] = (data ?? []).map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    channel: o.channel,
    customerName: o.customer_name,
    dueDate: o.due_date,
    needsArt: o.needs_art,
    items: o.order_items.map((i) => `${i.quantity.toLocaleString("pt-BR")}× ${i.description}`),
  }));

  return (
    <Board
      organizationId={membership.organizationId}
      initialOrders={orders}
      permissions={membership.permissions}
      today={todayIso()}
    />
  );
}

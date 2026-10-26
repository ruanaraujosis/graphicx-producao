"use client";

import { ArrowRight, GripVertical, Loader2, Palette, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ChannelBadge, type Channel } from "@/components/kit/channel-badge";
import { DueBadge } from "@/components/kit/order-badges";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Permission } from "@/lib/auth/permissions";
import { dueRisk } from "@/lib/orders/deadline";
import {
  BOARD_STATUSES,
  STATUS_LABELS,
  canSetStatus,
  nextStatus,
  orderNumber,
  type OrderStatus,
} from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/client";
import { changeOrderStatus } from "../pedidos/actions";

export type BoardOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  channel: Channel;
  customerName: string;
  dueDate: string | null;
  needsArt: boolean;
  items: string[];
};

export function Board({
  organizationId,
  initialOrders,
  permissions,
  today,
}: {
  organizationId: string;
  initialOrders: BoardOrder[];
  permissions: readonly Permission[];
  today: string;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [synced, setSynced] = useState(initialOrders);
  const [dragging, setDragging] = useState<BoardOrder | null>(null);
  const [over, setOver] = useState<OrderStatus | null>(null);
  // No celular abre na primeira etapa que tem pedidos.
  const [mobileColumn, setMobileColumn] = useState<OrderStatus>(
    () => BOARD_STATUSES.find((s) => initialOrders.some((o) => o.status === s)) ?? "novo",
  );
  const [live, setLive] = useState(false);
  const [moving, startMoving] = useTransition();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dados novos do servidor substituem o estado local (depois de mover ou do Realtime).
  if (initialOrders !== synced) {
    setSynced(initialOrders);
    setOrders(initialOrders);
  }

  // Tempo real: qualquer mudança nos pedidos da gráfica recarrega o quadro.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`pcp-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const columns = useMemo(
    () =>
      BOARD_STATUSES.map((status) => ({
        status,
        orders: orders.filter((o) => o.status === status),
      })),
    [orders],
  );
  const late = orders.filter(
    (o) =>
      o.status !== "enviado" && o.status !== "entregue" && dueRisk(o.dueDate, today) === "atrasado",
  ).length;

  function move(order: BoardOrder, to: OrderStatus) {
    if (order.status === to) return;
    if (!canSetStatus(permissions, order.status, to)) {
      toast.error(`Seu perfil não pode mover para ${STATUS_LABELS[to]}.`);
      return;
    }
    const before = orders;
    setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status: to } : o)));
    startMoving(async () => {
      const r = await changeOrderStatus(order.id, to);
      if (!r.ok) {
        setOrders(before);
        toast.error(r.error);
        return;
      }
      toast.success(`${orderNumber(order.number)} em ${STATUS_LABELS[to]}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            live ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
          )}
        >
          <Radio className="size-3.5" aria-hidden />
          {live ? "Ao vivo" : "Conectando…"}
        </span>
        {late > 0 && (
          <span className="rounded-full bg-destructive px-2.5 py-1 text-xs font-medium text-white">
            {late} atrasado(s)
          </span>
        )}
        {moving && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />
        )}
      </div>

      {/* Celular: uma coluna por vez */}
      <div className="flex flex-col gap-3 md:hidden">
        <Select value={mobileColumn} onValueChange={(v) => setMobileColumn(v as OrderStatus)}>
          <SelectTrigger className="w-full" aria-label="Etapa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((c) => (
              <SelectItem key={c.status} value={c.status}>
                {STATUS_LABELS[c.status]} ({c.orders.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ul className="flex flex-col gap-3">
          {(columns.find((c) => c.status === mobileColumn)?.orders ?? []).map((o) => (
            <li key={o.id}>
              <OrderCard order={o} today={today} permissions={permissions} onAdvance={move} />
            </li>
          ))}
          {columns.find((c) => c.status === mobileColumn)?.orders.length === 0 && (
            <li className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum pedido nesta etapa.
            </li>
          )}
        </ul>
      </div>

      {/* Tablet e computador: colunas com arrastar e soltar */}
      <div className="-mx-4 hidden overflow-x-auto px-4 pb-4 md:-mx-8 md:block md:px-8">
        <div className="flex w-max gap-3">
          {columns.map((c) => {
            const allowed = dragging ? canSetStatus(permissions, dragging.status, c.status) : false;
            return (
              <section
                key={c.status}
                aria-label={STATUS_LABELS[c.status]}
                onDragOver={(e) => {
                  if (!dragging || !allowed) return;
                  e.preventDefault();
                  setOver(c.status);
                }}
                onDragLeave={() => setOver((s) => (s === c.status ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && allowed) move(dragging, c.status);
                  setDragging(null);
                  setOver(null);
                }}
                className={cn(
                  "flex max-h-[calc(100dvh-14rem)] w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors",
                  dragging && allowed && "border-dashed border-primary/60",
                  over === c.status && "bg-primary/10",
                  dragging && !allowed && dragging.status !== c.status && "opacity-50",
                )}
              >
                <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
                  <h2 className="text-sm font-semibold">{STATUS_LABELS[c.status]}</h2>
                  <span className="rounded-full bg-card px-2 text-xs font-medium text-muted-foreground">
                    {c.orders.length}
                  </span>
                </header>
                <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {c.orders.map((o) => (
                    <li
                      key={o.id}
                      draggable={BOARD_STATUSES.some((s) => canSetStatus(permissions, o.status, s))}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", o.id);
                        setDragging(o);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      className={cn(dragging?.id === o.id && "opacity-40")}
                    >
                      <OrderCard
                        order={o}
                        today={today}
                        permissions={permissions}
                        onAdvance={move}
                        draggable
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  today,
  permissions,
  onAdvance,
  draggable,
}: {
  order: BoardOrder;
  today: string;
  permissions: readonly Permission[];
  onAdvance: (order: BoardOrder, to: OrderStatus) => void;
  draggable?: boolean;
}) {
  const next = nextStatus(order.status, order.needsArt);
  const canNext = next !== null && canSetStatus(permissions, order.status, next);
  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pedidos/${order.id}`}
          className="min-w-0 font-semibold outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {orderNumber(order.number)}
          <span className="block truncate text-sm font-normal text-muted-foreground">
            {order.customerName}
          </span>
        </Link>
        {draggable && (
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <DueBadge due={order.dueDate} status={order.status} today={today} />
        <ChannelBadge channel={order.channel} />
        {order.needsArt && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-info-soft px-2 text-xs text-info">
            <Palette className="size-3.5" aria-hidden />
            Arte
          </span>
        )}
      </div>
      {order.items.length > 0 && (
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {order.items.slice(0, 2).join(" · ")}
          {order.items.length > 2 ? ` · +${order.items.length - 2}` : ""}
        </p>
      )}
      {canNext && next && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 justify-between md:min-h-8"
          onClick={() => onAdvance(order, next)}
        >
          {STATUS_LABELS[next]}
          <ArrowRight />
        </Button>
      )}
    </article>
  );
}

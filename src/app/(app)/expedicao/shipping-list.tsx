"use client";

import { FileDown, Loader2, PackageCheck, QrCode, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { DueBadge, StatusPill } from "@/components/kit/order-badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SHOPEE_STATUS_LABELS } from "@/lib/marketplaces/shopee/labels";
import type { OrderStatus } from "@/lib/orders/status";
import { arrangeShipments } from "./actions";

export type ShippingRow = {
  id: string;
  number: number;
  customer_name: string;
  channel: "balcao" | "shopee" | "whatsapp";
  status: OrderStatus;
  due_date: string | null;
  ship_by_at: string | null;
  external_status: string | null;
  shipment_arranged_at: string | null;
  tracking_code: string | null;
};

/** Pedido da Shopee aguardando o envio ser organizado. */
const canArrange = (r: ShippingRow) =>
  r.channel === "shopee" &&
  !r.shipment_arranged_at &&
  ["READY_TO_SHIP", "RETRY_SHIP"].includes(r.external_status ?? "");
/** Pedido da Shopee com etiqueta disponível. */
const hasLabel = (r: ShippingRow) =>
  r.channel === "shopee" &&
  (Boolean(r.shipment_arranged_at) || ["PROCESSED", "SHIPPED"].includes(r.external_status ?? ""));

export function ShippingList({
  rows,
  today,
  canManage,
}: {
  rows: ShippingRow[];
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const chosen = rows.filter((r) => selected.has(r.id));
  const toArrange = chosen.filter(canArrange);
  // Etiqueta da Shopee: já organizados, ou ainda por organizar (a rota organiza na hora para quem pode).
  const withLabel = chosen.filter((r) => hasLabel(r) || (canManage && canArrange(r)));
  // Pedido que não veio da Shopee (balcão, WhatsApp ou lançado à mão): modelo da gráfica.
  const ownLabel = chosen.filter((r) => !r.external_status);
  const ids = (list: ShippingRow[]) => list.map((r) => r.id).join(",");

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOn = rows.length > 0 && selected.size === rows.length;

  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhum pedido nesta lista.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <label className="mr-auto flex min-h-11 items-center gap-2 text-sm md:min-h-0">
          <Checkbox
            checked={allOn}
            onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
          />
          {selected.size ? `${selected.size} selecionado(s)` : "Selecionar todos"}
        </label>
        {canManage && (
          <Button
            variant="outline"
            className="min-h-11 md:min-h-9"
            disabled={pending || !toArrange.length}
            onClick={() =>
              start(async () => {
                const r = await arrangeShipments(toArrange.map((x) => x.id));
                if (r.ok) {
                  toast.success(r.message);
                  setSelected(new Set());
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
            Organizar envio{toArrange.length ? ` (${toArrange.length})` : ""}
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          className="min-h-11 md:min-h-9"
          aria-disabled={!withLabel.length}
        >
          <a
            href={
              withLabel.length
                ? `/api/marketplaces/shopee/etiquetas?pedidos=${ids(withLabel)}&tipo=termica`
                : undefined
            }
            target="_blank"
            rel="noreferrer"
            className={withLabel.length ? "" : "pointer-events-none opacity-50"}
          >
            <FileDown />
            Etiquetas Shopee{withLabel.length ? ` (${withLabel.length})` : ""}
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="min-h-11 md:min-h-9"
          aria-disabled={!ownLabel.length}
        >
          <a
            href={ownLabel.length ? `/imprimir/envio?ids=${ids(ownLabel)}` : undefined}
            target="_blank"
            rel="noreferrer"
            className={ownLabel.length ? "" : "pointer-events-none opacity-50"}
          >
            <Tag />
            Etiquetas de envio{ownLabel.length ? ` (${ownLabel.length})` : ""}
          </a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="min-h-11 md:min-h-9"
          aria-disabled={!chosen.length}
        >
          <a
            href={chosen.length ? `/imprimir/pedidos?ids=${ids(chosen)}` : undefined}
            target="_blank"
            rel="noreferrer"
            className={chosen.length ? "" : "pointer-events-none opacity-50"}
          >
            <QrCode />
            QR Codes{chosen.length ? ` (${chosen.length})` : ""}
          </a>
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-card p-3 shadow-sm"
          >
            <label className="flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0">
              <span className="sr-only">Selecionar pedido #{r.number}</span>
              <Checkbox
                checked={selected.has(r.id)}
                onCheckedChange={(v) => toggle(r.id, Boolean(v))}
              />
            </label>
            <div className="min-w-40 flex-1">
              <Link href={`/pedidos/${r.id}`} className="font-semibold hover:underline">
                #{r.number}
              </Link>
              <p className="truncate text-sm text-muted-foreground">{r.customer_name}</p>
            </div>
            <ChannelBadge channel={r.channel} />
            <StatusPill status={r.status} />
            {r.channel === "shopee" && r.external_status && (
              <span className="text-xs text-muted-foreground">
                Shopee: {SHOPEE_STATUS_LABELS[r.external_status] ?? r.external_status}
              </span>
            )}
            <DueBadge due={r.due_date} status={r.status} today={today} />
            <span className="min-w-32 text-xs text-muted-foreground tabular-nums">
              {r.tracking_code
                ? `Rastreio ${r.tracking_code}`
                : canArrange(r)
                  ? "Envio não organizado"
                  : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

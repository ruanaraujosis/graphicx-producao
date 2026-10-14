import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/dal";
import { CHANNEL_LABELS } from "@/lib/catalog/pricing";
import { formatDateTime } from "@/lib/format";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { PrintToolbar } from "./print-toolbar";

export const metadata = { title: "Etiquetas de identificação" };

const MAX = 100;
const UUID = /^[0-9a-f-]{36}$/i;

/** "2026-10-20" → "20/10/2026" (data sem fuso). */
const dateBr = (d: string) => d.split("-").reverse().join("/");

export default function EtiquetasPage({ searchParams }: PageProps<"/imprimir/pedidos">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparando…</p>}>
      <Etiquetas searchParams={searchParams} />
    </Suspense>
  );
}

async function Etiquetas({
  searchParams,
}: {
  searchParams: PageProps<"/imprimir/pedidos">["searchParams"];
}) {
  const raw = await searchParams;
  const ids = (typeof raw.ids === "string" ? raw.ids.split(",") : [])
    .filter((id) => UUID.test(id))
    .slice(0, MAX);
  if (!ids.length) notFound();
  const format = raw.formato === "a4" ? "a4" : "etiqueta";

  const { membership } = await requireOrg("pedidos.ver");
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, number, customer_name, channel, due_date, ship_by_at, external_id, tracking_code, needs_art, order_items(description, quantity, position)",
    )
    .eq("organization_id", membership.organizationId)
    .in("id", ids);
  const byId = new Map((data ?? []).map((o) => [o.id, o]));
  const orders = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  if (!orders.length) notFound();
  const qrs = await Promise.all(orders.map((o) => orderQrSvg(o.id)));

  return (
    <div className="min-h-dvh bg-muted print:bg-white">
      <style>{`
        @page { size: ${format === "a4" ? "A4" : "100mm 150mm"}; margin: ${format === "a4" ? "8mm" : "0"}; }
        @media print { html, body { background: #fff !important; } }
      `}</style>
      <PrintToolbar ids={ids.join(",")} format={format} count={orders.length} />
      <main
        className={
          format === "a4"
            ? "mx-auto grid w-[194mm] grid-cols-2 gap-[4mm] py-6 print:py-0"
            : "mx-auto flex w-[100mm] flex-col gap-6 py-6 print:gap-0 print:py-0"
        }
      >
        {orders.map((o, i) => {
          const items = [...o.order_items].sort((a, b) => a.position - b.position);
          const due = o.ship_by_at
            ? formatDateTime(o.ship_by_at)
            : o.due_date
              ? dateBr(o.due_date)
              : null;
          return (
            <article
              key={o.id}
              className={
                format === "a4"
                  ? "flex h-[68mm] break-inside-avoid flex-col gap-[2mm] overflow-hidden rounded-[2mm] border border-black bg-white p-[4mm] text-black"
                  : "flex h-[150mm] break-after-page flex-col gap-[3mm] overflow-hidden bg-white p-[6mm] text-black shadow print:shadow-none"
              }
            >
              <div className="flex items-start justify-between gap-[3mm]">
                <div className="min-w-0">
                  <p
                    className={
                      format === "a4"
                        ? "text-[22pt] leading-none font-bold"
                        : "text-[34pt] leading-none font-bold"
                    }
                  >
                    {orderNumber(o.number)}
                  </p>
                  <p className="mt-[1mm] truncate text-[11pt] font-semibold">{o.customer_name}</p>
                  <p className="text-[9pt]">
                    {CHANNEL_LABELS[o.channel]}
                    {o.external_id ? ` · ${o.external_id}` : ""}
                  </p>
                </div>
                <div
                  aria-label={`QR Code do pedido ${orderNumber(o.number)}`}
                  role="img"
                  className={format === "a4" ? "size-[30mm] shrink-0" : "size-[42mm] shrink-0"}
                  // SVG gerado no servidor pela biblioteca de QR Code (sem conteúdo do usuário).
                  dangerouslySetInnerHTML={{ __html: qrs[i] }}
                />
              </div>
              {due && (
                <p className="rounded-[1mm] border border-black px-[2mm] py-[1mm] text-[10pt] font-semibold">
                  {o.ship_by_at ? "Postar até " : "Prazo "}
                  {due}
                </p>
              )}
              <ul className="flex flex-col gap-[0.5mm] text-[9pt] leading-tight">
                {items.slice(0, format === "a4" ? 3 : 8).map((it, n) => (
                  <li key={n} className="truncate">
                    {Number(it.quantity).toLocaleString("pt-BR")} × {it.description}
                  </li>
                ))}
                {items.length > (format === "a4" ? 3 : 8) && (
                  <li>+ {items.length - (format === "a4" ? 3 : 8)} item(ns)</li>
                )}
              </ul>
              <p className="mt-auto text-[8pt]">
                {o.tracking_code ? `Rastreio ${o.tracking_code} · ` : ""}
                Aponte a câmera para abrir o pedido no GraphicX
              </p>
            </article>
          );
        })}
      </main>
    </div>
  );
}

import { PDFDocument } from "pdf-lib";
import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import {
  arrangeShipment,
  type DocumentType,
  fetchShippingLabels,
  getTrackingNumber,
  type ShipMode,
} from "@/lib/marketplaces/shopee/logistics";
import { admin, loadShop, logger, shopCredentials } from "@/lib/marketplaces/store";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/** Página simples com o motivo (a rota abre numa aba nova). */
function problem(message: string, status = 409) {
  const escape = (t: string) =>
    t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiqueta da Shopee</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.5;color:#111;background:#fff}h1{font-size:20px}p{white-space:pre-line}button{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid #ccc;background:#fff;font:inherit;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}button{background:#222;color:#eee;border-color:#444}}</style></head>
<body><h1>Não foi possível gerar a etiqueta</h1><p>${escape(message)}</p><button onclick="window.close()">Fechar</button></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * Etiquetas de envio da Shopee em um PDF só (?pedidos=id1,id2&tipo=termica|a4).
 * Pedido com o envio ainda não organizado: quem tem expedicao.gerenciar
 * organiza na hora (agência ou coleta, conforme a loja). Até 50 por vez.
 */
export async function GET(request: NextRequest) {
  const { membership } = await requireOrg("expedicao.ver");
  const config = getShopeeConfig();
  if (!config) return problem("A integração com a Shopee não está ativa.", 503);

  const ids = (request.nextUrl.searchParams.get("pedidos") ?? "")
    .split(",")
    .filter((id) => UUID.test(id))
    .slice(0, 50);
  if (!ids.length) return problem("Escolha pelo menos um pedido.", 400);
  const type: DocumentType =
    request.nextUrl.searchParams.get("tipo") === "a4"
      ? "NORMAL_AIR_WAYBILL"
      : "THERMAL_AIR_WAYBILL";

  // Pela sessão (RLS): pedidos da gráfica ativa.
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, number, shop_id, external_id, package_number, tracking_code, shipment_arranged_at, external_status",
    )
    .eq("organization_id", membership.organizationId)
    .eq("channel", "shopee")
    .in("id", ids);
  const canArrange = can(membership.permissions, "expedicao.gerenciar");
  const arranged = (o: { shipment_arranged_at: string | null; external_status: string | null }) =>
    Boolean(o.shipment_arranged_at) || ["PROCESSED", "SHIPPED"].includes(o.external_status ?? "");
  const pendingArrange = (o: {
    shipment_arranged_at: string | null;
    external_status: string | null;
  }) => !arranged(o) && ["READY_TO_SHIP", "RETRY_SHIP"].includes(o.external_status ?? "");
  const orders = (data ?? []).filter(
    (o) => o.shop_id && o.external_id && (arranged(o) || (canArrange && pendingArrange(o))),
  );
  if (!orders.length)
    return problem(
      canArrange
        ? "Nenhum dos pedidos está pronto para envio na Shopee."
        : "Nenhum dos pedidos está com o envio organizado na Shopee. Peça a quem cuida da expedição para organizar o envio.",
    );

  const merged = await PDFDocument.create();
  const failures: string[] = [];
  const byShop = Map.groupBy(orders, (o) => o.shop_id!);
  for (const [shopId, list] of byShop) {
    const shop = await loadShop(shopId);
    if (!shop || shop.status !== "conectada") {
      failures.push(...list.map((o) => `#${o.number}: loja desconectada`));
      continue;
    }
    try {
      const creds = await shopCredentials(shop);
      const onLog = logger(shop);
      // Organiza na hora o envio dos que ainda não foram organizados.
      for (const o of list.filter(pendingArrange)) {
        const ref = { order_sn: o.external_id!, package_number: o.package_number };
        try {
          await arrangeShipment(config, creds, ref, shop.ship_mode as ShipMode, { onLog });
          const tracking = await getTrackingNumber(config, creds, ref, { onLog }).catch(() => null);
          o.tracking_code = tracking ?? o.tracking_code;
          o.shipment_arranged_at = new Date().toISOString();
          await admin()
            .from("orders")
            .update({
              shipment_arranged_at: o.shipment_arranged_at,
              external_status: "PROCESSED",
              ...(tracking ? { tracking_code: tracking.slice(0, 60) } : {}),
            })
            .eq("id", o.id);
        } catch (e) {
          failures.push(
            `#${o.number}: ${e instanceof Error ? e.message : "não foi possível organizar o envio"}`,
          );
        }
      }
      const ready = list.filter((o) => o.shipment_arranged_at || arranged(o));
      if (!ready.length) continue;
      const { pdf, failed } = await fetchShippingLabels(
        config,
        creds,
        ready.map((o) => ({
          order_sn: o.external_id!,
          package_number: o.package_number,
          tracking_number: o.tracking_code,
        })),
        type,
        { onLog },
      );
      for (const [sn, reason] of failed) {
        const o = list.find((x) => x.external_id === sn);
        failures.push(`#${o?.number ?? sn}: ${reason}`);
      }
      if (pdf) {
        const doc = await PDFDocument.load(pdf);
        for (const page of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(page);
      }
    } catch (e) {
      failures.push(...list.map((o) => `#${o.number}: ${e instanceof Error ? e.message : "erro"}`));
    }
  }

  if (!merged.getPageCount())
    return problem(`Nenhuma etiqueta foi gerada.\n\n${failures.join("\n")}`);
  const bytes = await merged.save();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquetas-shopee.pdf"`,
      "Cache-Control": "no-store",
      // Pedidos que ficaram de fora (a tela de expedição avisa).
      ...(failures.length
        ? { "X-Etiquetas-Falhas": encodeURIComponent(failures.join(" | ")).slice(0, 4000) }
        : {}),
    },
  });
}

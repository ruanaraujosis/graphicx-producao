import { PDFDocument } from "pdf-lib";
import type { NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { type DocumentType, fetchShippingLabels } from "@/lib/marketplaces/shopee/logistics";
import { loadShop, logger, shopCredentials } from "@/lib/marketplaces/store";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

function problem(message: string, status = 409) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Etiquetas de envio da Shopee em um PDF só (?pedidos=id1,id2&tipo=termica|a4).
 * Só pedidos com o envio já organizado. Até 50 por vez.
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
  const orders = (data ?? []).filter(
    (o) =>
      o.shop_id &&
      o.external_id &&
      (o.shipment_arranged_at || ["PROCESSED", "SHIPPED"].includes(o.external_status ?? "")),
  );
  if (!orders.length)
    return problem(
      "Nenhum dos pedidos está com o envio organizado na Shopee. Organize o envio antes.",
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
      const { pdf, failed } = await fetchShippingLabels(
        config,
        await shopCredentials(shop),
        list.map((o) => ({
          order_sn: o.external_id!,
          package_number: o.package_number,
          tracking_number: o.tracking_code,
        })),
        type,
        { onLog: logger(shop) },
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

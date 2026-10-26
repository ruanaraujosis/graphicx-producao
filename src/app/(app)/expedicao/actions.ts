"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/crud";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { getTrackingInfo, type TrackingEvent } from "@/lib/marketplaces/shopee/logistics";
import { admin, loadShop, logger, shopCredentials } from "@/lib/marketplaces/store";
import { processJobs } from "@/lib/marketplaces/worker";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Organiza o envio na Shopee dos pedidos escolhidos (agência ou coleta, conforme a loja). */
export async function arrangeShipments(orderIds: string[]): Promise<ActionResult> {
  const { membership } = await requireOrg("expedicao.gerenciar");
  const ids = orderIds.filter((id) => UUID.test(id)).slice(0, 100);
  if (!ids.length) return { ok: false, error: "Escolha pelo menos um pedido." };
  const supabase = await createClient();
  // Pela sessão (RLS): só pedidos da gráfica, da Shopee e ainda não organizados.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, shop_id, status, external_status, shipment_arranged_at")
    .eq("organization_id", membership.organizationId)
    .eq("channel", "shopee")
    .in("id", ids);
  const ready = (orders ?? []).filter(
    (o) =>
      o.shop_id &&
      o.status !== "cancelado" &&
      !o.shipment_arranged_at &&
      ["READY_TO_SHIP", "RETRY_SHIP"].includes(o.external_status ?? ""),
  );
  if (!ready.length)
    return { ok: false, error: "Nenhum dos pedidos está aguardando envio na Shopee." };

  const db = admin();
  for (const o of ready) {
    await db.rpc("marketplace_enqueue", {
      p_shop: o.shop_id!,
      p_kind: "shipment.arrange",
      p_payload: { order_id: o.id },
      p_dedupe: `arrange:${o.id}`,
    });
  }
  after(() => processJobs(20).catch(() => undefined));
  revalidatePath("/expedicao");
  const skipped = ids.length - ready.length;
  return {
    ok: true,
    message: `Organizando o envio de ${ready.length} pedido(s).${skipped ? ` ${skipped} ignorado(s) (já organizados ou fora da Shopee).` : ""} Atualize em instantes.`,
  };
}

/** Linha do tempo da entrega (consulta na hora na Shopee). */
export async function loadTracking(
  orderId: string,
): Promise<
  { ok: true; status: string | null; events: TrackingEvent[] } | { ok: false; error: string }
> {
  const { membership } = await requireOrg("pedidos.ver");
  if (!UUID.test(orderId)) return { ok: false, error: "Pedido inválido." };
  const config = getShopeeConfig();
  if (!config) return { ok: false, error: "A integração com a Shopee não está ativa." };
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("shop_id, external_id, package_number")
    .eq("id", orderId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!order?.shop_id || !order.external_id)
    return { ok: false, error: "Este pedido não é da Shopee." };
  const shop = await loadShop(order.shop_id);
  if (!shop || shop.status !== "conectada")
    return { ok: false, error: "A loja está desconectada." };
  try {
    const info = await getTrackingInfo(
      config,
      await shopCredentials(shop),
      { order_sn: order.external_id, package_number: order.package_number },
      { onLog: logger(shop) },
    );
    return { ok: true, ...info };
  } catch (e) {
    return {
      ok: false,
      error: `Não foi possível consultar o rastreio: ${e instanceof Error ? e.message : "erro"}`,
    };
  }
}

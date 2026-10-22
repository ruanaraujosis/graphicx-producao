import { after, type NextRequest } from "next/server";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { verifyPushSignature } from "@/lib/marketplaces/shopee/sign";
import { admin, logger } from "@/lib/marketplaces/store";
import { processJobs } from "@/lib/marketplaces/worker";

export const maxDuration = 60;

/** Códigos de aviso (push) da Shopee que a GraphicX trata. */
const ORDER_STATUS_PUSH = 3;
const TRACKING_NUMBER_PUSH = 4;

type Push = {
  code?: number;
  shop_id?: number;
  timestamp?: number;
  data?: {
    ordersn?: string;
    status?: string;
    update_time?: number;
    tracking_no?: string;
    package_number?: string;
  };
};

/**
 * Avisos da Shopee (push). Confere a assinatura, enfileira a tarefa e responde
 * na hora; o processamento roda logo em seguida (after) e, se falhar, o relógio
 * do banco tenta de novo.
 */
export async function POST(request: NextRequest) {
  const config = getShopeeConfig();
  if (!config) return new Response("Integração não configurada.", { status: 503 });

  const rawBody = await request.text();
  const url = `${request.nextUrl.origin}${request.nextUrl.pathname}`;
  if (
    !verifyPushSignature({
      partnerKey: config.partnerKey,
      url,
      rawBody,
      authorization: request.headers.get("authorization"),
    })
  ) {
    return new Response("Assinatura inválida.", { status: 401 });
  }

  let push: Push;
  try {
    push = JSON.parse(rawBody) as Push;
  } catch {
    return new Response("Corpo inválido.", { status: 400 });
  }
  // Aviso de teste da Shopee (sem loja): só confirmar.
  if (!push.shop_id) return new Response(null, { status: 200 });

  const db = admin();
  const { data: shop } = await db
    .from("marketplace_shops")
    .select("id, organization_id, status")
    .eq("marketplace", "shopee")
    .eq("external_shop_id", String(push.shop_id))
    .maybeSingle();
  if (!shop || shop.status === "desconectada") return new Response(null, { status: 200 });

  logger(
    shop,
    "entrada",
  )({
    endpoint: `push:${push.code ?? "?"}`,
    ok: true,
    statusCode: 200,
    durationMs: 0,
    requestId: null,
    error: null,
  });

  if (push.code === ORDER_STATUS_PUSH && push.data?.ordersn) {
    await db.rpc("marketplace_enqueue", {
      p_shop: shop.id,
      p_kind: "orders.import",
      p_payload: { order_sn: push.data.ordersn, status: push.data.status ?? null },
      p_dedupe: `${push.data.ordersn}:${push.data.status ?? ""}`,
    });
    after(() => processJobs(10).catch(() => undefined));
  }
  if (push.code === TRACKING_NUMBER_PUSH && push.data?.ordersn && push.data.tracking_no) {
    await db
      .from("orders")
      .update({ tracking_code: push.data.tracking_no.slice(0, 60) })
      .eq("shop_id", shop.id)
      .eq("external_id", push.data.ordersn);
  }
  return new Response(null, { status: 200 });
}

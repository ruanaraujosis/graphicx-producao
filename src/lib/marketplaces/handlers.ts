import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { requireShopeeConfig } from "./shopee/config";
import {
  getOrderDetails,
  getOrderFee,
  listOrderSns,
  ORDER_LIST_MAX_RANGE_S,
  type ShopeeOrder,
  toNeutralOrder,
} from "./shopee/orders";
import { admin, logger, shopCredentials, type ShopRow } from "./store";

type Job = Database["public"]["Tables"]["marketplace_jobs"]["Row"];

/** Tarefa da fila: recebe a loja e o payload; lança erro para tentar de novo. */
export type JobHandler = (ctx: { job: Job; shop: ShopRow }) => Promise<void>;

/** Na primeira conferência, busca os pedidos alterados nos últimos 3 dias. */
const FIRST_SYNC_S = 3 * 24 * 60 * 60;
/** Sobreposição entre conferências, para não perder pedido na virada. */
const OVERLAP_S = 10 * 60;

/** Grava (ou atualiza) um pedido da Shopee, com a taxa real quando já existir. */
async function saveShopeeOrder(shop: ShopRow, order: ShopeeOrder) {
  const config = requireShopeeConfig();
  const creds = await shopCredentials(shop);
  const neutral = toNeutralOrder(order);
  if (neutral.target_status && neutral.target_status !== "cancelado") {
    const total = neutral.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    // A Shopee só calcula o repasse depois do pagamento; sem ele, a conta usa a forma de pagamento.
    neutral.fee = await getOrderFee(config, creds, order.order_sn, total, {
      onLog: logger(shop),
    }).catch(() => null);
  }
  const { error } = await admin().rpc("marketplace_upsert_order", {
    p_shop: shop.id,
    p_order: neutral,
  });
  if (error) throw new Error(`Pedido ${order.order_sn}: ${error.message}`);
}

export const handlers: Record<string, JobHandler> = {
  // Renova a autorização antes de vencer.
  "auth.refresh": async ({ shop }) => {
    await shopCredentials(shop, true);
  },

  // Aviso da Shopee: um pedido mudou de status.
  "orders.import": async ({ job, shop }) => {
    const sn = (job.payload as { order_sn?: string }).order_sn;
    if (!sn) return;
    const creds = await shopCredentials(shop);
    const [order] = await getOrderDetails(requireShopeeConfig(), creds, [sn], {
      onLog: logger(shop),
    });
    if (!order) throw new Error(`Pedido ${sn} não encontrado na Shopee.`);
    await saveShopeeOrder(shop, order);
  },

  // Rotina: confere os pedidos alterados desde a última vez (cobre avisos perdidos).
  "orders.reconcile": async ({ shop }) => {
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const now = Math.floor(Date.now() / 1000);
    const since = shop.orders_synced_until
      ? Math.floor(new Date(shop.orders_synced_until).getTime() / 1000) - OVERLAP_S
      : now - FIRST_SYNC_S;
    const from = Math.max(since, now - ORDER_LIST_MAX_RANGE_S + 60);

    const sns = await listOrderSns(config, creds, { from, to: now }, { onLog: logger(shop) });
    const orders = await getOrderDetails(config, creds, sns, { onLog: logger(shop) });
    for (const order of orders) await saveShopeeOrder(shop, order);

    await admin()
      .from("marketplace_shops")
      .update({ orders_synced_until: new Date(now * 1000).toISOString() })
      .eq("id", shop.id);
  },
};

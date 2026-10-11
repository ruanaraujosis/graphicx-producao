import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { ShopeeError } from "./shopee/client";
import { requireShopeeConfig } from "./shopee/config";
import {
  getOrderDetails,
  getOrderFee,
  listOrderSns,
  ORDER_LIST_MAX_RANGE_S,
  type ShopeeOrder,
  toNeutralOrder,
} from "./shopee/orders";
import {
  fetchListings,
  listItemIds,
  updateDaysToShip,
  updatePrice,
  updateStock,
} from "./shopee/products";
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

type Target = Database["public"]["Functions"]["marketplace_listing_targets"]["Returns"][number];

/** Agrupa por anúncio (a Shopee atualiza as variações de um anúncio numa chamada). */
function byItem(rows: Target[]) {
  const map = new Map<string, Target[]>();
  for (const r of rows) map.set(r.external_item_id, [...(map.get(r.external_item_id) ?? []), r]);
  return map;
}

async function loadTargets(shop: ShopRow) {
  const { data, error } = await admin().rpc("marketplace_listing_targets", { p_shop: shop.id });
  if (error) throw new Error(`Anúncios: ${error.message}`);
  return data ?? [];
}

/** Grava o resultado do envio em cada anúncio. */
async function markListing(
  id: string,
  fields: Database["public"]["Tables"]["marketplace_listings"]["Update"],
) {
  await admin()
    .from("marketplace_listings")
    .update({ ...fields, last_synced_at: new Date().toISOString() })
    .eq("id", id);
}

/** Erro de um anúncio não para os outros; token inválido para tudo (a fila tenta de novo). */
function itemError(e: unknown) {
  if (e instanceof ShopeeError && e.isAuth) throw e;
  return e instanceof Error ? e.message.slice(0, 1000) : "Erro ao enviar.";
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

  // Importa os anúncios da loja e vincula pelo SKU.
  "listings.import": async ({ shop }) => {
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const onLog = logger(shop);
    const ids = await listItemIds(config, creds, { onLog });
    const listings = await fetchListings(config, creds, ids, { onLog });
    const { error } = await admin().rpc("marketplace_upsert_listings", {
      p_shop: shop.id,
      p_items: listings,
      p_complete: true,
    });
    if (error) throw new Error(`Anúncios: ${error.message}`);
  },

  // Envia estoque (com a margem da loja) e prazo de postagem do que mudou.
  "stock.push_all": async ({ shop }) => {
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const onLog = logger(shop);
    for (const [itemId, rows] of byItem(await loadTargets(shop))) {
      for (const r of rows.filter((r) => r.stock === null)) {
        await markListing(r.listing_id, { sync_error: r.skip_reason });
      }
      const changed = rows.filter((r) => r.stock !== null && r.stock !== r.last_stock_sent);
      if (changed.length) {
        try {
          const failed = await updateStock(
            config,
            creds,
            itemId,
            changed.map((r) => ({ modelId: r.external_model_id, stock: r.stock ?? 0 })),
            { onLog },
          );
          for (const r of changed) {
            const reason = failed.get(r.external_model_id || "0");
            await markListing(
              r.listing_id,
              reason ? { sync_error: reason } : { last_stock_sent: r.stock, sync_error: null },
            );
          }
        } catch (e) {
          const message = itemError(e);
          for (const r of changed) await markListing(r.listing_id, { sync_error: message });
        }
      }
      // Prazo: o maior prazo de produção entre as variações do anúncio.
      const days = Math.max(...rows.map((r) => r.production_days));
      if (rows.some((r) => r.last_days_sent !== days)) {
        try {
          await updateDaysToShip(config, creds, itemId, days, { onLog });
          for (const r of rows) await markListing(r.listing_id, { last_days_sent: days });
        } catch (e) {
          const message = `Prazo de postagem: ${itemError(e)}`;
          for (const r of rows) await markListing(r.listing_id, { sync_error: message });
        }
      }
    }
  },

  // Envia o preço do canal Shopee (só com o envio de preços ligado na loja).
  "price.push_all": async ({ shop }) => {
    if (!shop.price_sync_enabled) return;
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const onLog = logger(shop);
    for (const [itemId, rows] of byItem(await loadTargets(shop))) {
      const changed = rows.filter(
        (r) => r.price > 0 && Number(r.last_price_sent) !== Number(r.price),
      );
      if (!changed.length) continue;
      try {
        const failed = await updatePrice(
          config,
          creds,
          itemId,
          changed.map((r) => ({ modelId: r.external_model_id, price: Number(r.price) })),
          { onLog },
        );
        for (const r of changed) {
          const reason = failed.get(r.external_model_id || "0");
          await markListing(
            r.listing_id,
            reason ? { sync_error: reason } : { last_price_sent: r.price, sync_error: null },
          );
        }
      } catch (e) {
        const message = itemError(e);
        for (const r of changed) await markListing(r.listing_id, { sync_error: message });
      }
    }
  },
};

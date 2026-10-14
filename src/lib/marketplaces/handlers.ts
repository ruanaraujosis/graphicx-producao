import "server-only";
import sharp from "sharp";
import type { Database } from "@/lib/supabase/database.types";
import { ShopeeError } from "./shopee/client";
import { requireShopeeConfig } from "./shopee/config";
import { arrangeShipment, getTrackingNumber, type ShipMode } from "./shopee/logistics";
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
import { type PublicationPayload, publicationProblems } from "./publication";
import {
  addItem,
  getCategories,
  initTierVariation,
  MAX_IMAGES,
  type PublishVariant,
  uploadImage,
} from "./shopee/publish";
import { admin, logger, shopCredentials, type ShopRow } from "./store";

/** Erro que repetir não resolve: a tarefa vai direto para "erro". */
export class PermanentError extends Error {}

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

/** Pedido da Shopee desta loja (conferido pela loja da tarefa). */
async function shopOrder(shop: ShopRow, orderId: string | undefined) {
  if (!orderId) throw new PermanentError("Pedido não informado.");
  const { data } = await admin()
    .from("orders")
    .select("id, external_id, package_number, tracking_code, status")
    .eq("id", orderId)
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (!data?.external_id) throw new PermanentError("Pedido da Shopee não encontrado nesta loja.");
  return { ...data, external_id: data.external_id };
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

  // Atualiza a árvore de categorias da Shopee (dado público, compartilhado).
  "categories.sync": async ({ shop }) => {
    const categories = await getCategories(requireShopeeConfig(), await shopCredentials(shop), {
      onLog: logger(shop),
    });
    if (!categories.length) throw new Error("A Shopee não devolveu categorias.");
    const now = new Date().toISOString();
    for (let i = 0; i < categories.length; i += 500) {
      const { error } = await admin()
        .from("marketplace_categories")
        .upsert(
          categories
            .slice(i, i + 500)
            .map((c) => ({ ...c, marketplace: "shopee" as const, updated_at: now })),
          { onConflict: "marketplace,category_id" },
        );
      if (error) throw new Error(`Categorias: ${error.message}`);
    }
  },

  // Publica um anúncio novo a partir do cadastro.
  "listing.publish": async ({ job, shop }) => {
    const id = (job.payload as { publication_id?: string }).publication_id;
    if (!id) throw new PermanentError("Publicação não informada.");
    const db = admin();
    const { data, error } = await db.rpc("marketplace_publication_payload", { p_publication: id });
    if (error) throw new Error(`Publicação: ${error.message}`);
    if (!data) throw new PermanentError("Publicação não encontrada.");
    const p = data as unknown as PublicationPayload;
    const pub = p.publication;
    try {
      const problems = publicationProblems({
        title: pub.title,
        description: pub.description,
        category_id: pub.category_id,
        logistics: pub.logistics,
        images: p.images.length,
        productActive: p.product.active,
        variants: p.variants,
      });
      if (problems.length) throw new PermanentError(problems.join(" "));

      const config = requireShopeeConfig();
      const creds = await shopCredentials(shop);
      const onLog = logger(shop);
      const variants = p.variants.map((v) => ({
        ...v,
        stock: v.stock ?? 0,
        weight_g: v.weight_g ?? 0,
      })) satisfies PublishVariant[];

      // Se o anúncio já foi criado numa tentativa anterior, só falta concluir as variações.
      let itemId = pub.external_item_id ? Number(pub.external_item_id) : null;
      if (!itemId) {
        const imageIds: string[] = [];
        for (const [i, path] of p.images.slice(0, MAX_IMAGES).entries()) {
          const file = await db.storage.from("produtos").download(path);
          if (file.error) throw new Error(`Foto ${i + 1}: ${file.error.message}`);
          const jpeg = await sharp(Buffer.from(await file.data.arrayBuffer()))
            .rotate()
            .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 88 })
            .toBuffer();
          imageIds.push(await uploadImage(config, jpeg, `foto-${i + 1}.jpg`, { onLog }));
        }
        itemId = await addItem(
          config,
          creds,
          {
            title: pub.title,
            description: pub.description,
            categoryId: Number(pub.category_id),
            attributes: pub.attributes,
            logistics: pub.logistics,
            itemStatus: pub.item_status,
            productionDays: p.product.production_days,
            imageIds,
            variants,
          },
          { onLog },
        );
        await db
          .from("marketplace_publications")
          .update({ external_item_id: String(itemId) })
          .eq("id", pub.id);
      }

      const links =
        variants.length === 1
          ? [{ variant_id: variants[0].variant_id, model_id: "" }]
          : await initTierVariation(config, creds, itemId, variants, { onLog });

      const now = new Date().toISOString();
      const { error: listErr } = await db.from("marketplace_listings").upsert(
        variants.map((v, i) => ({
          organization_id: pub.organization_id,
          shop_id: pub.shop_id,
          variant_id: v.variant_id,
          external_item_id: String(itemId),
          external_model_id: links[i]?.model_id ?? "",
          title: variants.length === 1 ? pub.title : `${pub.title} — ${v.name}`.slice(0, 300),
          external_sku: v.sku,
          status: pub.item_status === "NORMAL" ? "ativo" : "inativo",
          external_price: v.price,
          external_stock: v.stock,
          last_price_sent: v.price,
          last_stock_sent: v.stock,
          last_days_sent: p.product.production_days,
          last_synced_at: now,
          sync_error: null,
        })),
        { onConflict: "shop_id,external_item_id,external_model_id" },
      );
      if (listErr) throw new Error(`Vínculos: ${listErr.message}`);

      await db
        .from("marketplace_publications")
        .update({ status: "publicado", published_at: now, error: null })
        .eq("id", pub.id);
    } catch (e) {
      await db
        .from("marketplace_publications")
        .update({
          status: "erro",
          error: (e instanceof Error ? e.message : "Erro ao publicar.").slice(0, 1000),
        })
        .eq("id", pub.id);
      throw e;
    }
  },

  // Organiza o envio na Shopee (agência ou coleta) e busca o código de rastreio.
  "shipment.arrange": async ({ job, shop }) => {
    const order = await shopOrder(shop, (job.payload as { order_id?: string }).order_id);
    if (order.status === "cancelado") throw new PermanentError("Pedido cancelado.");
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const onLog = logger(shop);
    const ref = { order_sn: order.external_id, package_number: order.package_number };
    try {
      await arrangeShipment(config, creds, ref, shop.ship_mode as ShipMode, { onLog });
    } catch (e) {
      // Erro de cadastro/transportadora: repetir não resolve.
      if (e instanceof Error && !(e instanceof ShopeeError)) throw new PermanentError(e.message);
      throw e;
    }
    const tracking = await getTrackingNumber(config, creds, ref, { onLog }).catch(() => null);
    await admin()
      .from("orders")
      .update({
        shipment_arranged_at: new Date().toISOString(),
        external_status: "PROCESSED",
        ...(tracking ? { tracking_code: tracking.slice(0, 60) } : {}),
      })
      .eq("id", order.id);
    // O rastreio às vezes demora alguns minutos para sair.
    if (!tracking) {
      await admin().rpc("marketplace_enqueue", {
        p_shop: shop.id,
        p_kind: "shipment.tracking",
        p_payload: { order_id: order.id },
        p_dedupe: `tracking:${order.id}`,
        p_run_after: new Date(Date.now() + 2 * 60_000).toISOString(),
      });
    }
  },

  // Busca o código de rastreio (tenta de novo com espera crescente até sair).
  "shipment.tracking": async ({ job, shop }) => {
    const order = await shopOrder(shop, (job.payload as { order_id?: string }).order_id);
    if (order.tracking_code) return;
    const tracking = await getTrackingNumber(
      requireShopeeConfig(),
      await shopCredentials(shop),
      { order_sn: order.external_id, package_number: order.package_number },
      { onLog: logger(shop) },
    );
    if (!tracking) throw new Error("A Shopee ainda não gerou o código de rastreio.");
    await admin()
      .from("orders")
      .update({ tracking_code: tracking.slice(0, 60) })
      .eq("id", order.id);
  },
};

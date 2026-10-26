import "server-only";
import sharp from "sharp";
import { getPublicEnv } from "@/lib/env";
import { orderNumber } from "@/lib/orders/status";
import type { Database } from "@/lib/supabase/database.types";
import { chatMessage, DEFAULT_CHAT_TEMPLATE, isChatNotAllowed, sendChatText } from "./shopee/chat";
import { ShopeeError } from "./shopee/client";
import { requireShopeeConfig } from "./shopee/config";
import { arrangeShipment, getTrackingNumber, type ShipMode } from "./shopee/logistics";
import {
  boostItems,
  getBoostedItems,
  getComments,
  pickBoostItems,
  replyComments,
} from "./shopee/marketing";
import { AUTO_REPLY_MIN_STARS, buyerFirstName, suggestReply } from "./replies";
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

/**
 * Link ativo de arte do pedido. Reaproveita um link válido por mais de 7 dias
 * (criar outro desativaria o que o cliente já recebeu).
 */
async function artLinkUrl(order: { id: string; organization_id: string }) {
  const db = admin();
  const { data: current } = await db
    .from("art_links")
    .select("token")
    .eq("order_id", order.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date(Date.now() + 7 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let link = current;
  if (!link) {
    const { data, error } = await db
      .from("art_links")
      .insert({ organization_id: order.organization_id, order_id: order.id })
      .select("token")
      .single();
    if (error || !data) throw new Error(`Link de arte: ${error?.message ?? "erro"}`);
    link = data;
  }
  return new URL(`/a/${link.token}`, getPublicEnv().NEXT_PUBLIC_APP_URL).toString();
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

  // Mensagem automática no chat após a compra, com o link para enviar a arte.
  "chat.welcome": async ({ job, shop }) => {
    if (!shop.chat_message_enabled) return;
    const orderId = (job.payload as { order_id?: string }).order_id;
    if (!orderId) throw new PermanentError("Pedido não informado.");
    const db = admin();
    const { data: order } = await db
      .from("orders")
      .select(
        "id, organization_id, number, external_id, external_buyer_id, needs_art, status, chat_sent_at",
      )
      .eq("id", orderId)
      .eq("shop_id", shop.id)
      .maybeSingle();
    if (!order) throw new PermanentError("Pedido não encontrado nesta loja.");
    // Já enviada, cancelado ou sem arte: nada a fazer.
    if (order.chat_sent_at || order.status === "cancelado" || !order.needs_art) return;
    if (!order.external_buyer_id)
      throw new PermanentError("A Shopee não informou o comprador deste pedido.");

    const text = chatMessage(shop.chat_template || DEFAULT_CHAT_TEMPLATE, {
      loja: shop.name ?? "nossa loja",
      pedido: order.external_id ?? orderNumber(order.number),
      link: await artLinkUrl(order),
    });
    try {
      await sendChatText(
        requireShopeeConfig(),
        await shopCredentials(shop),
        order.external_buyer_id,
        text,
        { onLog: logger(shop) },
      );
    } catch (e) {
      if (isChatNotAllowed(e)) {
        await db
          .from("marketplace_shops")
          .update({
            last_error:
              "A Shopee não liberou o chat para esta conta: a mensagem automática não foi enviada. Desligue a opção em Ajustes ou peça a liberação à Shopee.",
          })
          .eq("id", shop.id);
        throw new PermanentError("Chat não liberado pela Shopee para esta conta.");
      }
      throw e;
    }
    await db.from("orders").update({ chat_sent_at: new Date().toISOString() }).eq("id", order.id);
    await db.from("order_events").insert({
      organization_id: order.organization_id,
      order_id: order.id,
      type: "link_arte",
      message: "Link da arte enviado ao comprador pelo chat da Shopee.",
      actor_label: "Shopee",
    });
  },

  // Impulsiona até 5 anúncios da lista de prioridade (rodízio a cada 4 h).
  "boost.run": async ({ shop }) => {
    if (!shop.boost_enabled) return;
    const db = admin();
    const config = requireShopeeConfig();
    const creds = await shopCredentials(shop);
    const onLog = logger(shop);
    const [{ data: items }, { data: listings }, boostedNow] = await Promise.all([
      db
        .from("marketplace_boost_items")
        .select("id, external_item_id, position, active, last_boosted_at")
        .eq("shop_id", shop.id),
      db
        .from("marketplace_listings")
        .select("external_item_id, external_stock, last_stock_sent")
        .eq("shop_id", shop.id)
        .neq("status", "excluido"),
      getBoostedItems(config, creds, { onLog }),
    ]);
    // Estoque do anúncio = soma das variações (nulo se não se sabe).
    const stock = new Map<string, number | null>();
    for (const l of listings ?? []) {
      const s = l.last_stock_sent ?? l.external_stock;
      const prev = stock.get(l.external_item_id);
      stock.set(l.external_item_id, s === null ? (prev ?? null) : (prev ?? 0) + s);
    }
    const chosen = pickBoostItems(
      (items ?? []).map((i) => ({ ...i, stock: stock.get(i.external_item_id) ?? null })),
      boostedNow,
    );
    const now = new Date().toISOString();
    if (chosen.length) {
      const failed = await boostItems(config, creds, chosen, { onLog });
      for (const itemId of chosen) {
        const reason = failed.get(itemId);
        await db
          .from("marketplace_boost_items")
          .update(
            reason
              ? { last_error: reason.slice(0, 500) }
              : { last_boosted_at: now, last_error: null },
          )
          .eq("shop_id", shop.id)
          .eq("external_item_id", itemId);
      }
    }
    await db.from("marketplace_shops").update({ last_boost_at: now }).eq("id", shop.id);
  },

  // Traz as avaliações novas; 4–5★ respondidas sozinhas, 1–3★ ficam com sugestão.
  "reviews.import": async ({ shop }) => {
    const db = admin();
    const comments = await getComments(requireShopeeConfig(), await shopCredentials(shop), {
      onLog: logger(shop),
    });
    const ids = comments.map((c) => String(c.comment_id));
    const [{ data: known }, { data: templates }, { data: listings }] = await Promise.all([
      ids.length
        ? db
            .from("marketplace_reviews")
            .select("external_comment_id")
            .eq("shop_id", shop.id)
            .in("external_comment_id", ids)
        : Promise.resolve({ data: [] as { external_comment_id: string }[] }),
      db
        .from("marketplace_reply_templates")
        .select("min_stars, max_stars, body")
        .eq("organization_id", shop.organization_id)
        .eq("active", true),
      db.from("marketplace_listings").select("external_item_id, title").eq("shop_id", shop.id),
    ]);
    const seen = new Set((known ?? []).map((k) => k.external_comment_id));
    const titles = new Map((listings ?? []).map((l) => [l.external_item_id, l.title]));
    const loja = shop.review_signature || shop.name || "nossa loja";

    for (const c of comments) {
      const commentId = String(c.comment_id);
      if (seen.has(commentId)) continue;
      const rating = Math.min(5, Math.max(1, c.rating_star ?? 5));
      const itemId = c.item_id ? String(c.item_id) : null;
      const already = c.comment_reply?.reply?.trim();
      const auto = !already && shop.review_auto_reply && rating >= AUTO_REPLY_MIN_STARS;
      const reply =
        already ||
        suggestReply({
          rating,
          templates: templates ?? [],
          vars: {
            comprador: buyerFirstName(c.buyer_username),
            produto: (itemId && titles.get(itemId)) || "",
            loja,
          },
          seed: commentId,
        });
      const { data: row } = await db
        .from("marketplace_reviews")
        .insert({
          organization_id: shop.organization_id,
          shop_id: shop.id,
          external_comment_id: commentId,
          external_item_id: itemId,
          item_title: itemId ? (titles.get(itemId) ?? null) : null,
          rating,
          comment: c.comment?.slice(0, 2000) ?? null,
          buyer_name: c.buyer_username?.slice(0, 120) ?? null,
          commented_at: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
          reply_text: reply.slice(0, 500) || null,
          status: already ? "respondida" : auto ? "enviando" : "pendente",
          auto,
          replied_at: already ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (row && auto) {
        await db.rpc("marketplace_enqueue", {
          p_shop: shop.id,
          p_kind: "reviews.reply",
          p_payload: { review_id: row.id },
          p_dedupe: `reply:${row.id}`,
        });
      }
    }
    await db
      .from("marketplace_shops")
      .update({ reviews_synced_at: new Date().toISOString() })
      .eq("id", shop.id);
  },

  // Envia a resposta de uma avaliação.
  "reviews.reply": async ({ job, shop }) => {
    const reviewId = (job.payload as { review_id?: string }).review_id;
    if (!reviewId) throw new PermanentError("Avaliação não informada.");
    const db = admin();
    const { data: review } = await db
      .from("marketplace_reviews")
      .select("id, external_comment_id, reply_text, status")
      .eq("id", reviewId)
      .eq("shop_id", shop.id)
      .maybeSingle();
    if (!review) throw new PermanentError("Avaliação não encontrada nesta loja.");
    if (review.status === "respondida" || review.status === "ignorada") return;
    if (!review.reply_text?.trim()) throw new PermanentError("Resposta vazia.");
    const failed = await replyComments(
      requireShopeeConfig(),
      await shopCredentials(shop),
      [{ commentId: review.external_comment_id, text: review.reply_text }],
      { onLog: logger(shop) },
    );
    const reason = failed.get(review.external_comment_id);
    await db
      .from("marketplace_reviews")
      .update(
        reason
          ? { status: "erro", error: reason.slice(0, 500) }
          : { status: "respondida", replied_at: new Date().toISOString(), error: null },
      )
      .eq("id", review.id);
    if (reason) throw new PermanentError(`Shopee recusou a resposta: ${reason}`);
  },
};

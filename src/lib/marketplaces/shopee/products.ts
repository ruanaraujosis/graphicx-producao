import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

type PriceInfo = { current_price?: number; original_price?: number }[];
type StockInfo = { summary_info?: { total_available_stock?: number } };

type BaseInfo = {
  item_id: number;
  item_name?: string;
  item_sku?: string;
  item_status?: string;
  has_model?: boolean;
  price_info?: PriceInfo;
  stock_info_v2?: StockInfo;
};

type ModelList = {
  tier_variation?: { name?: string; option_list?: { option?: string }[] }[];
  model?: {
    model_id: number;
    model_sku?: string;
    tier_index?: number[];
    price_info?: PriceInfo;
    stock_info_v2?: StockInfo;
  }[];
};

/** Anúncio no formato de public.marketplace_upsert_listings. */
export type NeutralListing = {
  external_item_id: string;
  external_model_id: string;
  title: string;
  external_sku: string | null;
  status: "ativo" | "inativo" | "excluido";
  external_price: number | null;
  external_stock: number | null;
};

/** Prazo de postagem: até 3 dias é envio normal; acima, pré-encomenda. */
export const NORMAL_MAX_DAYS = 3;
/** Faixa aceita pela Shopee para pré-encomenda (ajustar se a região exigir outra). */
export const PRE_ORDER_MIN_DAYS = 7;
export const PRE_ORDER_MAX_DAYS = 30;

export function daysToShip(productionDays: number) {
  if (productionDays <= NORMAL_MAX_DAYS) {
    return { is_pre_order: false, days_to_ship: Math.max(1, productionDays) };
  }
  return {
    is_pre_order: true,
    days_to_ship: Math.min(Math.max(productionDays, PRE_ORDER_MIN_DAYS), PRE_ORDER_MAX_DAYS),
  };
}

const sku = (s?: string) => s?.trim() || null;
const price = (p?: PriceInfo) => p?.[0]?.original_price ?? p?.[0]?.current_price ?? null;
const stock = (s?: StockInfo) => s?.summary_info?.total_available_stock ?? null;
const status = (s?: string): NeutralListing["status"] =>
  s === "NORMAL" ? "ativo" : s === "UNLIST" ? "inativo" : "excluido";

/** Converte o anúncio (e as variações, se houver) para o formato neutro. */
export function toNeutralListings(base: BaseInfo, models?: ModelList): NeutralListing[] {
  const title = base.item_name?.trim() || `Anúncio ${base.item_id}`;
  if (!base.has_model || !models?.model?.length) {
    return [
      {
        external_item_id: String(base.item_id),
        external_model_id: "",
        title,
        external_sku: sku(base.item_sku),
        status: status(base.item_status),
        external_price: price(base.price_info),
        external_stock: stock(base.stock_info_v2),
      },
    ];
  }
  const tiers = models.tier_variation ?? [];
  return models.model.map((m) => {
    const name = (m.tier_index ?? [])
      .map((idx, t) => tiers[t]?.option_list?.[idx]?.option)
      .filter(Boolean)
      .join(" / ");
    return {
      external_item_id: String(base.item_id),
      external_model_id: String(m.model_id),
      title: name ? `${title} — ${name}` : title,
      external_sku: sku(m.model_sku) ?? sku(base.item_sku),
      status: status(base.item_status),
      external_price: price(m.price_info),
      external_stock: stock(m.stock_info_v2),
    };
  });
}

/** Ids dos anúncios ativos e pausados da loja. */
export async function listItemIds(config: ShopeeConfig, shop: ShopCredentials, opts: Opts = {}) {
  const ids: number[] = [];
  for (const itemStatus of ["NORMAL", "UNLIST"]) {
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const r = await shopeeRequest<{
        response?: { item?: { item_id: number }[]; has_next_page?: boolean; next_offset?: number };
      }>({
        config,
        path: "/api/v2/product/get_item_list",
        shop,
        query: { offset, page_size: 100, item_status: itemStatus },
        ...opts,
      });
      ids.push(...(r.response?.item ?? []).map((i) => i.item_id));
      if (!r.response?.has_next_page || r.response.next_offset === undefined) break;
      offset = r.response.next_offset;
    }
  }
  return ids;
}

/** Anúncios completos (com variações) no formato neutro. */
export async function fetchListings(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemIds: number[],
  opts: Opts = {},
) {
  const out: NeutralListing[] = [];
  for (let i = 0; i < itemIds.length; i += 50) {
    const r = await shopeeRequest<{ response?: { item_list?: BaseInfo[] } }>({
      config,
      path: "/api/v2/product/get_item_base_info",
      shop,
      query: { item_id_list: itemIds.slice(i, i + 50).join(",") },
      ...opts,
    });
    for (const base of r.response?.item_list ?? []) {
      let models: ModelList | undefined;
      if (base.has_model) {
        const m = await shopeeRequest<{ response?: ModelList }>({
          config,
          path: "/api/v2/product/get_model_list",
          shop,
          query: { item_id: base.item_id },
          ...opts,
        });
        models = m.response;
      }
      out.push(...toNeutralListings(base, models));
    }
  }
  return out;
}

type Failure = { model_id?: number; failed_reason?: string };

/** Erros por variação devolvidos pela Shopee (o restante foi aceito). */
function failures(r: { response?: { failure_list?: Failure[] } }) {
  return new Map(
    (r.response?.failure_list ?? []).map((f) => [
      String(f.model_id ?? 0),
      f.failed_reason ?? "Recusado.",
    ]),
  );
}

export async function updateStock(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemId: string,
  list: { modelId: string; stock: number }[],
  opts: Opts = {},
) {
  const r = await shopeeRequest<{ response?: { failure_list?: Failure[] } }>({
    config,
    path: "/api/v2/product/update_stock",
    method: "POST",
    shop,
    body: {
      item_id: Number(itemId),
      stock_list: list.map((m) => ({
        model_id: Number(m.modelId || 0),
        seller_stock: [{ stock: Math.max(0, Math.floor(m.stock)) }],
      })),
    },
    ...opts,
  });
  return failures(r);
}

export async function updatePrice(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemId: string,
  list: { modelId: string; price: number }[],
  opts: Opts = {},
) {
  const r = await shopeeRequest<{ response?: { failure_list?: Failure[] } }>({
    config,
    path: "/api/v2/product/update_price",
    method: "POST",
    shop,
    body: {
      item_id: Number(itemId),
      price_list: list.map((m) => ({ model_id: Number(m.modelId || 0), original_price: m.price })),
    },
    ...opts,
  });
  return failures(r);
}

export async function updateDaysToShip(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemId: string,
  productionDays: number,
  opts: Opts = {},
) {
  await shopeeRequest({
    config,
    path: "/api/v2/product/update_item",
    method: "POST",
    shop,
    body: { item_id: Number(itemId), pre_order: daysToShip(productionDays) },
    ...opts,
  });
}

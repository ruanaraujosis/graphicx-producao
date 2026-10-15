import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";
import { daysToShip } from "./products";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

const LANGUAGE = "pt-br";
/** Limites da Shopee usados na validação antes de publicar. */
export const MAX_IMAGES = 9;
export const MAX_OPTION_LENGTH = 20;
export const MAX_OPTIONS = 50;

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------
type RawCategory = {
  category_id: number;
  parent_category_id?: number;
  original_category_name?: string;
  display_category_name?: string;
  has_children?: boolean;
};

export type Category = {
  category_id: number;
  parent_id: number | null;
  name: string;
  path: string;
  has_children: boolean;
};

/** Monta o caminho "Casa > Decoração > Quadros" de cada categoria. */
export function withPaths(raw: RawCategory[]): Category[] {
  const byId = new Map(raw.map((c) => [c.category_id, c]));
  const name = (c: RawCategory) =>
    (c.display_category_name || c.original_category_name || String(c.category_id)).trim();
  return raw.map((c) => {
    const parts = [name(c)];
    let parent = c.parent_category_id ? byId.get(c.parent_category_id) : undefined;
    for (let depth = 0; parent && depth < 10; depth++) {
      parts.unshift(name(parent));
      parent = parent.parent_category_id ? byId.get(parent.parent_category_id) : undefined;
    }
    return {
      category_id: c.category_id,
      parent_id: c.parent_category_id || null,
      name: name(c),
      path: parts.join(" > ").slice(0, 1000),
      has_children: Boolean(c.has_children),
    };
  });
}

export async function getCategories(config: ShopeeConfig, shop: ShopCredentials, opts: Opts = {}) {
  const r = await shopeeRequest<{ response?: { category_list?: RawCategory[] } }>({
    config,
    path: "/api/v2/product/get_category",
    shop,
    query: { language: LANGUAGE },
    ...opts,
  });
  return withPaths(r.response?.category_list ?? []);
}

// -----------------------------------------------------------------------------
// Atributos da categoria
// -----------------------------------------------------------------------------
type RawAttribute = {
  attribute_id: number;
  original_attribute_name?: string;
  display_attribute_name?: string;
  is_mandatory?: boolean;
  input_type?: string;
  attribute_unit?: string[];
  attribute_value_list?: {
    value_id: number;
    original_value_name?: string;
    display_value_name?: string;
  }[];
};

export type Attribute = {
  attribute_id: number;
  name: string;
  mandatory: boolean;
  /** select: escolher da lista; multi: várias da lista; text: digitar (pode sugerir da lista). */
  kind: "select" | "multi" | "text";
  units: string[];
  values: { value_id: number; name: string }[];
};

export function toAttributes(raw: RawAttribute[]): Attribute[] {
  return raw
    .map((a) => ({
      attribute_id: a.attribute_id,
      name: (
        a.display_attribute_name ||
        a.original_attribute_name ||
        `Atributo ${a.attribute_id}`
      ).trim(),
      mandatory: Boolean(a.is_mandatory),
      kind:
        a.input_type === "DROP_DOWN"
          ? ("select" as const)
          : a.input_type === "MULTIPLE_SELECT"
            ? ("multi" as const)
            : ("text" as const),
      units: a.attribute_unit ?? [],
      values: (a.attribute_value_list ?? []).map((v) => ({
        value_id: v.value_id,
        name: (v.display_value_name || v.original_value_name || "").trim(),
      })),
    }))
    .sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || a.name.localeCompare(b.name));
}

export async function getAttributes(
  config: ShopeeConfig,
  shop: ShopCredentials,
  categoryId: number,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{ response?: { attribute_list?: RawAttribute[] } }>({
    config,
    path: "/api/v2/product/get_attributes",
    shop,
    query: { category_id: categoryId, language: LANGUAGE },
    ...opts,
  });
  return toAttributes(r.response?.attribute_list ?? []);
}

// -----------------------------------------------------------------------------
// Fretes habilitados na loja
// -----------------------------------------------------------------------------
export type LogisticsChannel = { id: number; name: string };

export async function getLogisticsChannels(
  config: ShopeeConfig,
  shop: ShopCredentials,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: {
      logistics_channel_list?: {
        logistics_channel_id: number;
        logistics_channel_name?: string;
        enabled?: boolean;
      }[];
    };
  }>({ config, path: "/api/v2/logistics/get_channel_list", shop, ...opts });
  return (r.response?.logistics_channel_list ?? [])
    .filter((c) => c.enabled)
    .map((c) => ({
      id: c.logistics_channel_id,
      name: c.logistics_channel_name ?? `Frete ${c.logistics_channel_id}`,
    }));
}

// -----------------------------------------------------------------------------
// Fotos
// -----------------------------------------------------------------------------
export async function uploadImage(
  config: ShopeeConfig,
  jpeg: Uint8Array,
  fileName: string,
  opts: Opts = {},
) {
  const form = new FormData();
  form.append("image", new Blob([jpeg as BlobPart], { type: "image/jpeg" }), fileName);
  const r = await shopeeRequest<{ response?: { image_info?: { image_id?: string } } }>({
    config,
    path: "/api/v2/media_space/upload_image",
    method: "POST",
    form,
    ...opts,
  });
  const id = r.response?.image_info?.image_id;
  if (!id) throw new Error("A Shopee não devolveu o código da foto.");
  return id;
}

// -----------------------------------------------------------------------------
// Anúncio
// -----------------------------------------------------------------------------
export type PublishVariant = {
  variant_id: string;
  sku: string;
  name: string;
  price: number;
  stock: number;
  weight_g: number;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
};

export type PublishInput = {
  title: string;
  description: string;
  categoryId: number;
  attributes: {
    attribute_id: number;
    values: { value_id: number; original_value_name?: string; value_unit?: string }[];
  }[];
  logistics: number[];
  itemStatus: "NORMAL" | "UNLIST";
  productionDays: number;
  imageIds: string[];
  variants: PublishVariant[];
};

/** Nomes das opções (únicos, no limite de tamanho da Shopee). */
export function optionNames(variants: { name: string }[]) {
  const used = new Set<string>();
  return variants.map((v, i) => {
    let name = v.name.trim().slice(0, MAX_OPTION_LENGTH) || `Opção ${i + 1}`;
    if (used.has(name.toLowerCase())) {
      const suffix = ` ${i + 1}`;
      name = name.slice(0, MAX_OPTION_LENGTH - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Corpo do add_item. Com várias variações, o preço/estoque vêm depois em init_tier_variation. */
export function addItemBody(input: PublishInput) {
  const single = input.variants.length === 1;
  const first = input.variants[0];
  const heaviest = Math.max(...input.variants.map((v) => v.weight_g));
  const dims = input.variants.find((v) => v.length_cm && v.width_cm && v.height_cm);
  return {
    item_name: input.title.trim(),
    description: input.description.trim(),
    category_id: input.categoryId,
    original_price: single ? first.price : Math.min(...input.variants.map((v) => v.price)),
    seller_stock: [
      { stock: single ? first.stock : input.variants.reduce((s, v) => s + v.stock, 0) },
    ],
    weight: Math.max(heaviest, 1) / 1000,
    ...(dims
      ? {
          dimension: {
            package_length: Math.max(1, Math.ceil(dims.length_cm ?? 1)),
            package_width: Math.max(1, Math.ceil(dims.width_cm ?? 1)),
            package_height: Math.max(1, Math.ceil(dims.height_cm ?? 1)),
          },
        }
      : {}),
    image: { image_id_list: input.imageIds.slice(0, MAX_IMAGES) },
    logistic_info: input.logistics.map((id) => ({ logistic_id: id, enabled: true })),
    attribute_list: input.attributes.filter((a) => a.values.length),
    pre_order: daysToShip(input.productionDays),
    condition: "NEW",
    item_status: input.itemStatus,
    brand: { brand_id: 0, original_brand_name: "NoBrand" },
    ...(single ? { item_sku: first.sku } : {}),
  };
}

export function tierBody(itemId: number, variants: PublishVariant[]) {
  const names = optionNames(variants);
  return {
    item_id: itemId,
    tier_variation: [{ name: "Variação", option_list: names.map((option) => ({ option })) }],
    model: variants.map((v, i) => ({
      tier_index: [i],
      original_price: v.price,
      model_sku: v.sku,
      seller_stock: [{ stock: v.stock }],
    })),
  };
}

export async function addItem(
  config: ShopeeConfig,
  shop: ShopCredentials,
  input: PublishInput,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{ response?: { item_id?: number } }>({
    config,
    path: "/api/v2/product/add_item",
    method: "POST",
    shop,
    body: addItemBody(input),
    ...opts,
  });
  if (!r.response?.item_id) throw new Error("A Shopee não devolveu o código do anúncio.");
  return r.response.item_id;
}

/** Cria as variações; devolve o model_id de cada variação do cadastro (pela ordem). */
export async function initTierVariation(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemId: number,
  variants: PublishVariant[],
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: { model?: { model_id: number; tier_index?: number[]; model_sku?: string }[] };
  }>({
    config,
    path: "/api/v2/product/init_tier_variation",
    method: "POST",
    shop,
    body: tierBody(itemId, variants),
    ...opts,
  });
  const models = r.response?.model ?? [];
  return variants.map((v, i) => {
    const m =
      models.find((x) => x.model_sku === v.sku) ?? models.find((x) => x.tier_index?.[0] === i);
    return { variant_id: v.variant_id, model_id: m ? String(m.model_id) : null };
  });
}

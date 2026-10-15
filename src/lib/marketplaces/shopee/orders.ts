import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

/** Status do pedido na Shopee (API v2). */
export type ShopeeOrderStatus =
  | "UNPAID"
  | "READY_TO_SHIP"
  | "PROCESSED"
  | "RETRY_SHIP"
  | "SHIPPED"
  | "TO_CONFIRM_RECEIVE"
  | "IN_CANCEL"
  | "CANCELLED"
  | "TO_RETURN"
  | "COMPLETED";

export type ShopeeOrderItem = {
  item_id: number;
  item_name?: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_discounted_price?: number;
  model_original_price?: number;
};

export type ShopeeOrder = {
  order_sn: string;
  order_status: ShopeeOrderStatus | string;
  create_time?: number;
  update_time?: number;
  ship_by_date?: number;
  buyer_username?: string;
  buyer_user_id?: number;
  message_to_seller?: string;
  cancel_reason?: string;
  item_list?: ShopeeOrderItem[];
  package_list?: { package_number?: string }[];
};

/** Pedido no formato neutro de public.marketplace_upsert_order. */
export type NeutralOrder = {
  external_id: string;
  external_status: string;
  target_status: "novo" | "enviado" | "entregue" | "cancelado" | null;
  customer_name: string | null;
  /** Id do comprador na Shopee (para o chat). */
  buyer_id: string | null;
  ship_by_at: string | null;
  package_number: string | null;
  notes: string | null;
  cancel_reason: string | null;
  fee: number | null;
  items: {
    external_item_id: string;
    external_model_id: string;
    sku: string | null;
    description: string;
    quantity: number;
    unit_price: number;
  }[];
};

/** Até 15 dias por consulta (limite da Shopee). */
export const ORDER_LIST_MAX_RANGE_S = 15 * 24 * 60 * 60;
const DETAIL_FIELDS =
  "buyer_username,buyer_user_id,item_list,ship_by_date,package_list,message_to_seller,cancel_reason,total_amount";

/** Tradução do status da Shopee para o status da GraphicX (nulo = ainda não pago). */
export function targetStatus(status: string): NeutralOrder["target_status"] {
  switch (status) {
    case "UNPAID":
      return null;
    case "SHIPPED":
    case "TO_CONFIRM_RECEIVE":
      return "enviado";
    case "COMPLETED":
      return "entregue";
    case "CANCELLED":
      return "cancelado";
    // READY_TO_SHIP, PROCESSED, RETRY_SHIP, IN_CANCEL, TO_RETURN: a produção segue o fluxo interno.
    default:
      return "novo";
  }
}

export function toNeutralOrder(o: ShopeeOrder, fee: number | null = null): NeutralOrder {
  const items = (o.item_list ?? []).map((i) => {
    const model = i.model_id ? String(i.model_id) : "";
    const name = [i.item_name, i.model_name].filter(Boolean).join(" — ");
    return {
      external_item_id: String(i.item_id),
      external_model_id: model === "0" ? "" : model,
      sku: (i.model_sku || i.item_sku || "").trim() || null,
      description: name || `Item ${i.item_id}`,
      quantity: Math.max(1, i.model_quantity_purchased ?? 1),
      unit_price: i.model_discounted_price ?? i.model_original_price ?? 0,
    };
  });
  return {
    external_id: o.order_sn,
    external_status: o.order_status,
    target_status: targetStatus(o.order_status),
    customer_name: o.buyer_username ?? null,
    buyer_id: o.buyer_user_id ? String(o.buyer_user_id) : null,
    ship_by_at: o.ship_by_date ? new Date(o.ship_by_date * 1000).toISOString() : null,
    package_number: o.package_list?.find((p) => p.package_number)?.package_number ?? null,
    notes: o.message_to_seller?.trim()
      ? `Mensagem do comprador: ${o.message_to_seller.trim()}`
      : null,
    cancel_reason: o.cancel_reason?.trim() || null,
    fee,
    items,
  };
}

/** Números dos pedidos alterados no período (com paginação). */
export async function listOrderSns(
  config: ShopeeConfig,
  shop: ShopCredentials,
  range: { from: number; to: number },
  opts: Opts = {},
) {
  const sns: string[] = [];
  let cursor = "";
  for (let page = 0; page < 50; page++) {
    const r = await shopeeRequest<{
      response?: { order_list?: { order_sn: string }[]; more?: boolean; next_cursor?: string };
    }>({
      config,
      path: "/api/v2/order/get_order_list",
      shop,
      query: {
        time_range_field: "update_time",
        time_from: range.from,
        time_to: range.to,
        page_size: 100,
        cursor,
      },
      ...opts,
    });
    sns.push(...(r.response?.order_list ?? []).map((o) => o.order_sn));
    if (!r.response?.more || !r.response.next_cursor) break;
    cursor = r.response.next_cursor;
  }
  return sns;
}

/** Detalhes de até 50 pedidos por chamada. */
export async function getOrderDetails(
  config: ShopeeConfig,
  shop: ShopCredentials,
  sns: string[],
  opts: Opts = {},
) {
  const out: ShopeeOrder[] = [];
  for (let i = 0; i < sns.length; i += 50) {
    const r = await shopeeRequest<{ response?: { order_list?: ShopeeOrder[] } }>({
      config,
      path: "/api/v2/order/get_order_detail",
      shop,
      query: {
        order_sn_list: sns.slice(i, i + 50).join(","),
        response_optional_fields: DETAIL_FIELDS,
      },
      ...opts,
    });
    out.push(...(r.response?.order_list ?? []));
  }
  return out;
}

/**
 * Taxas reais do pedido: valor pago pelo comprador menos o que a loja recebe
 * (comissão, taxa de serviço, transação e frete). Nulo se ainda não houver.
 */
export async function getOrderFee(
  config: ShopeeConfig,
  shop: ShopCredentials,
  orderSn: string,
  itemsTotal: number,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: { order_income?: { escrow_amount?: number } };
  }>({
    config,
    path: "/api/v2/payment/get_escrow_detail",
    shop,
    query: { order_sn: orderSn },
    ...opts,
  });
  const escrow = r.response?.order_income?.escrow_amount;
  if (typeof escrow !== "number") return null;
  return feeFromEscrow(itemsTotal, escrow);
}

/** Taxa = total dos itens − repasse, limitada entre 0 e o total. */
export function feeFromEscrow(itemsTotal: number, escrow: number) {
  const fee = Math.round((itemsTotal - escrow) * 100) / 100;
  return Math.min(Math.max(fee, 0), itemsTotal);
}

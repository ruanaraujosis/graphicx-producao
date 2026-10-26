import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

export type ShipMode = "dropoff" | "pickup";
export type DocumentType = "THERMAL_AIR_WAYBILL" | "NORMAL_AIR_WAYBILL";
export type PackageRef = { order_sn: string; package_number?: string | null };

type ShippingParameter = {
  info_needed?: { dropoff?: string[]; pickup?: string[]; non_integrated?: string[] };
  pickup?: {
    address_list?: {
      address_id: number;
      address_flag?: string[];
      time_slot_list?: { pickup_time_id?: string; date?: number }[];
    }[];
  };
};

const pkg = (p: PackageRef) => ({
  order_sn: p.order_sn,
  ...(p.package_number ? { package_number: p.package_number } : {}),
});

/**
 * Escolhe como entregar o pacote: o modo preferido da loja se a Shopee aceitar,
 * senão o outro. Coleta usa o endereço de coleta padrão e o primeiro horário.
 */
export function shipOrderBody(order: PackageRef, param: ShippingParameter, preferred: ShipMode) {
  const info = param.info_needed ?? {};
  const canDropoff = info.dropoff !== undefined;
  const addresses = param.pickup?.address_list ?? [];
  const address = addresses.find((a) => a.address_flag?.includes("pickup_address")) ?? addresses[0];
  const slot = address?.time_slot_list?.find((t) => t.pickup_time_id);
  const canPickup = info.pickup !== undefined && Boolean(address && slot);

  const mode: ShipMode | null =
    preferred === "pickup"
      ? canPickup
        ? "pickup"
        : canDropoff
          ? "dropoff"
          : null
      : canDropoff
        ? "dropoff"
        : canPickup
          ? "pickup"
          : null;
  if (!mode) {
    throw new Error(
      info.non_integrated !== undefined
        ? "Este pedido usa uma transportadora não integrada: informe o código de rastreio no Seller Centre."
        : "A Shopee não ofereceu entrega na agência nem coleta para este pedido.",
    );
  }
  return {
    ...pkg(order),
    ...(mode === "dropoff"
      ? { dropoff: {} }
      : { pickup: { address_id: address!.address_id, pickup_time_id: slot!.pickup_time_id } }),
  };
}

/** Organiza o envio na Shopee (o pedido passa a "Etiqueta gerada"). */
export async function arrangeShipment(
  config: ShopeeConfig,
  shop: ShopCredentials,
  order: PackageRef,
  preferred: ShipMode,
  opts: Opts = {},
) {
  const param = await shopeeRequest<{ response?: ShippingParameter }>({
    config,
    path: "/api/v2/logistics/get_shipping_parameter",
    shop,
    query: { order_sn: order.order_sn, package_number: order.package_number ?? undefined },
    ...opts,
  });
  await shopeeRequest({
    config,
    path: "/api/v2/logistics/ship_order",
    method: "POST",
    shop,
    body: shipOrderBody(order, param.response ?? {}, preferred),
    ...opts,
  });
}

export async function getTrackingNumber(
  config: ShopeeConfig,
  shop: ShopCredentials,
  order: PackageRef,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{ response?: { tracking_number?: string } }>({
    config,
    path: "/api/v2/logistics/get_tracking_number",
    shop,
    query: { order_sn: order.order_sn, package_number: order.package_number ?? undefined },
    ...opts,
  });
  return r.response?.tracking_number?.trim() || null;
}

export type TrackingEvent = { at: string; description: string; status: string | null };

export async function getTrackingInfo(
  config: ShopeeConfig,
  shop: ShopCredentials,
  order: PackageRef,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: {
      logistics_status?: string;
      tracking_info?: { update_time?: number; description?: string; logistics_status?: string }[];
    };
  }>({
    config,
    path: "/api/v2/logistics/get_tracking_info",
    shop,
    query: { order_sn: order.order_sn, package_number: order.package_number ?? undefined },
    ...opts,
  });
  const events: TrackingEvent[] = (r.response?.tracking_info ?? [])
    .map((t) => ({
      at: new Date((t.update_time ?? 0) * 1000).toISOString(),
      description: t.description?.trim() || "Atualização",
      status: t.logistics_status ?? null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
  return { status: r.response?.logistics_status ?? null, events };
}

/**
 * Gera e baixa as etiquetas (até 50 por vez): pede a criação, espera ficarem
 * prontas e baixa o PDF. Devolve o PDF e os pedidos que falharam.
 */
export async function fetchShippingLabels(
  config: ShopeeConfig,
  shop: ShopCredentials,
  orders: (PackageRef & { tracking_number?: string | null })[],
  type: DocumentType,
  opts: Opts & { wait?: (ms: number) => Promise<void>; attempts?: number } = {},
) {
  const wait = opts.wait ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const list = orders.slice(0, 50);
  const failed = new Map<string, string>();

  const created = await shopeeRequest<{
    response?: { result_list?: { order_sn: string; fail_error?: string; fail_message?: string }[] };
  }>({
    config,
    path: "/api/v2/logistics/create_shipping_document",
    method: "POST",
    shop,
    body: {
      order_list: list.map((o) => ({
        ...pkg(o),
        ...(o.tracking_number ? { tracking_number: o.tracking_number } : {}),
        shipping_document_type: type,
      })),
    },
    ...opts,
  });
  for (const r of created.response?.result_list ?? []) {
    if (r.fail_error) failed.set(r.order_sn, r.fail_message || r.fail_error);
  }

  let pending = list.filter((o) => !failed.has(o.order_sn));
  const ready: PackageRef[] = [];
  for (let attempt = 0; pending.length && attempt < (opts.attempts ?? 8); attempt++) {
    if (attempt) await wait(1500);
    const result = await shopeeRequest<{
      response?: {
        result_list?: {
          order_sn: string;
          status?: string;
          fail_error?: string;
          fail_message?: string;
        }[];
      };
    }>({
      config,
      path: "/api/v2/logistics/get_shipping_document_result",
      method: "POST",
      shop,
      body: { order_list: pending.map((o) => ({ ...pkg(o), shipping_document_type: type })) },
      ...opts,
    });
    const byOrder = new Map((result.response?.result_list ?? []).map((r) => [r.order_sn, r]));
    const still: typeof pending = [];
    for (const o of pending) {
      const r = byOrder.get(o.order_sn);
      if (r?.status === "READY") ready.push(o);
      else if (r?.status === "FAILED" || r?.fail_error)
        failed.set(o.order_sn, r.fail_message || r.fail_error || "A Shopee não gerou a etiqueta.");
      else still.push(o);
    }
    pending = still;
  }
  for (const o of pending)
    failed.set(o.order_sn, "A etiqueta ainda está sendo gerada. Tente de novo.");

  const pdf = ready.length
    ? await shopeeRequest<Uint8Array>({
        config,
        path: "/api/v2/logistics/download_shipping_document",
        method: "POST",
        shop,
        binary: true,
        body: { shipping_document_type: type, order_list: ready.map(pkg) },
        ...opts,
      })
    : null;
  return { pdf, failed };
}

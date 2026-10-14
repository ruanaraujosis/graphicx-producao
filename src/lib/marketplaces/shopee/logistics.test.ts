// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ShopeeConfig } from "./config";
import { fetchShippingLabels, getTrackingInfo, shipOrderBody } from "./logistics";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};
const shop = { shopId: 555, accessToken: "tok" };

const pickupParam = {
  info_needed: { dropoff: [], pickup: ["address_id", "pickup_time_id"] },
  pickup: {
    address_list: [
      { address_id: 1, address_flag: ["default_address"], time_slot_list: [] },
      {
        address_id: 2,
        address_flag: ["pickup_address"],
        time_slot_list: [{ date: 1, pickup_time_id: "slot-a" }, { pickup_time_id: "slot-b" }],
      },
    ],
  },
};

describe("envio da Shopee", () => {
  it("leva à agência quando a loja prefere e a Shopee aceita", () => {
    expect(
      shipOrderBody({ order_sn: "SN1", package_number: "PK1" }, pickupParam, "dropoff"),
    ).toEqual({
      order_sn: "SN1",
      package_number: "PK1",
      dropoff: {},
    });
  });

  it("coleta: endereço de coleta e primeiro horário", () => {
    expect(shipOrderBody({ order_sn: "SN1" }, pickupParam, "pickup")).toEqual({
      order_sn: "SN1",
      pickup: { address_id: 2, pickup_time_id: "slot-a" },
    });
  });

  it("usa o outro modo quando o preferido não está disponível", () => {
    expect(shipOrderBody({ order_sn: "SN1" }, { info_needed: { dropoff: [] } }, "pickup")).toEqual({
      order_sn: "SN1",
      dropoff: {},
    });
  });

  it("transportadora não integrada pede o rastreio no Seller Centre", () => {
    expect(() =>
      shipOrderBody(
        { order_sn: "SN1" },
        { info_needed: { non_integrated: ["tracking_no"] } },
        "dropoff",
      ),
    ).toThrow(/não integrada/);
  });

  it("etiquetas: cria, espera ficar pronta, baixa o PDF e informa as que falharam", async () => {
    const paths: string[] = [];
    const responses: Record<string, unknown[]> = {
      "/api/v2/logistics/create_shipping_document": [
        {
          response: {
            result_list: [{ order_sn: "B", fail_error: "x", fail_message: "Pedido cancelado" }],
          },
        },
      ],
      "/api/v2/logistics/get_shipping_document_result": [
        {
          response: {
            result_list: [
              { order_sn: "A", status: "PROCESSING" },
              { order_sn: "C", status: "READY" },
            ],
          },
        },
        { response: { result_list: [{ order_sn: "A", status: "READY" }] } },
      ],
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path.endsWith("download_shipping_document")) {
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      return new Response(JSON.stringify(responses[path].shift()), {
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const { pdf, failed } = await fetchShippingLabels(
      config,
      shop,
      [{ order_sn: "A" }, { order_sn: "B" }, { order_sn: "C", package_number: "PK3" }],
      "THERMAL_AIR_WAYBILL",
      { fetchImpl, wait: async () => {} },
    );
    expect(Array.from(pdf!)).toEqual([37, 80, 68, 70]);
    expect(Object.fromEntries(failed)).toEqual({ B: "Pedido cancelado" });
    expect(paths.filter((p) => p.endsWith("get_shipping_document_result"))).toHaveLength(2);
  });

  it("rastreio do mais recente para o mais antigo", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              logistics_status: "LOGISTICS_PICKUP_DONE",
              tracking_info: [
                { update_time: 100, description: "Postado" },
                { update_time: 200, description: "Em trânsito" },
              ],
            },
          }),
        ),
    ) as unknown as typeof fetch;
    const info = await getTrackingInfo(config, shop, { order_sn: "SN" }, { fetchImpl });
    expect(info.events.map((e) => e.description)).toEqual(["Em trânsito", "Postado"]);
    expect(info.status).toBe("LOGISTICS_PICKUP_DONE");
  });
});

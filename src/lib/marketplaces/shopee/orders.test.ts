// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ShopeeConfig } from "./config";
import { feeFromEscrow, getOrderFee, listOrderSns, targetStatus, toNeutralOrder } from "./orders";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};
const shop = { shopId: 555, accessToken: "tok" };

function fake(responses: unknown[]) {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

describe("pedidos da Shopee", () => {
  it("traduz o status", () => {
    expect(targetStatus("UNPAID")).toBeNull();
    expect(targetStatus("READY_TO_SHIP")).toBe("novo");
    expect(targetStatus("PROCESSED")).toBe("novo");
    expect(targetStatus("SHIPPED")).toBe("enviado");
    expect(targetStatus("TO_CONFIRM_RECEIVE")).toBe("enviado");
    expect(targetStatus("COMPLETED")).toBe("entregue");
    expect(targetStatus("CANCELLED")).toBe("cancelado");
    expect(targetStatus("IN_CANCEL")).toBe("novo");
  });

  it("converte o pedido para o formato neutro", () => {
    const n = toNeutralOrder({
      order_sn: "2410ABC",
      order_status: "READY_TO_SHIP",
      ship_by_date: 1_760_000_000,
      buyer_username: "comprador",
      message_to_seller: "  Nome na caneca: Ana ",
      package_list: [{ package_number: "PK9" }],
      item_list: [
        {
          item_id: 10,
          item_name: "Caneca",
          model_id: 11,
          model_name: "Branca",
          model_sku: "CAN-325",
          item_sku: "CAN",
          model_quantity_purchased: 2,
          model_discounted_price: 39.9,
        },
        {
          item_id: 20,
          item_name: "Chaveiro",
          model_id: 0,
          item_sku: " CHV ",
          model_original_price: 10,
        },
      ],
    });
    expect(n).toMatchObject({
      external_id: "2410ABC",
      target_status: "novo",
      customer_name: "comprador",
      ship_by_at: new Date(1_760_000_000_000).toISOString(),
      package_number: "PK9",
      notes: "Mensagem do comprador: Nome na caneca: Ana",
      fee: null,
    });
    expect(n.items).toEqual([
      {
        external_item_id: "10",
        external_model_id: "11",
        sku: "CAN-325",
        description: "Caneca — Branca",
        quantity: 2,
        unit_price: 39.9,
      },
      {
        external_item_id: "20",
        external_model_id: "",
        sku: "CHV",
        description: "Chaveiro",
        quantity: 1,
        unit_price: 10,
      },
    ]);
  });

  it("taxa = total − repasse, sem passar dos limites", () => {
    expect(feeFromEscrow(100, 82.35)).toBe(17.65);
    expect(feeFromEscrow(100, 120)).toBe(0);
    expect(feeFromEscrow(100, -5)).toBe(100);
  });

  it("lista pedidos seguindo a paginação", async () => {
    const { fetchImpl, urls } = fake([
      {
        response: {
          order_list: [{ order_sn: "A" }, { order_sn: "B" }],
          more: true,
          next_cursor: "c2",
        },
      },
      { response: { order_list: [{ order_sn: "C" }], more: false } },
    ]);
    const sns = await listOrderSns(config, shop, { from: 1, to: 2 }, { fetchImpl });
    expect(sns).toEqual(["A", "B", "C"]);
    expect(urls[0].pathname).toBe("/api/v2/order/get_order_list");
    expect(urls[0].searchParams.get("time_range_field")).toBe("update_time");
    expect(urls[1].searchParams.get("cursor")).toBe("c2");
  });

  it("busca a taxa real no repasse", async () => {
    const { fetchImpl, urls } = fake([{ response: { order_income: { escrow_amount: 70 } } }]);
    expect(await getOrderFee(config, shop, "SN", 85, { fetchImpl })).toBe(15);
    expect(urls[0].searchParams.get("order_sn")).toBe("SN");
  });
});

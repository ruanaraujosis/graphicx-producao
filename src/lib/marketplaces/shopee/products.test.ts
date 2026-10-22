// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ShopeeConfig } from "./config";
import { daysToShip, listItemIds, toNeutralListings, updateStock } from "./products";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};
const shop = { shopId: 555, accessToken: "tok" };

function fake(responses: unknown[]) {
  const calls: { url: URL; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("anúncios da Shopee", () => {
  it("anúncio sem variações vira uma linha", () => {
    expect(
      toNeutralListings({
        item_id: 1,
        item_name: " Caneca ",
        item_sku: "CAN",
        item_status: "NORMAL",
        has_model: false,
        price_info: [{ original_price: 39.9, current_price: 35 }],
        stock_info_v2: { summary_info: { total_available_stock: 12 } },
      }),
    ).toEqual([
      {
        external_item_id: "1",
        external_model_id: "",
        title: "Caneca",
        external_sku: "CAN",
        status: "ativo",
        external_price: 39.9,
        external_stock: 12,
      },
    ]);
  });

  it("variações recebem o nome das opções e herdam o SKU do anúncio", () => {
    const rows = toNeutralListings(
      {
        item_id: 2,
        item_name: "Camiseta",
        item_sku: "CAM",
        item_status: "UNLIST",
        has_model: true,
      },
      {
        tier_variation: [
          { name: "Cor", option_list: [{ option: "Branca" }, { option: "Preta" }] },
          { name: "Tamanho", option_list: [{ option: "P" }, { option: "M" }] },
        ],
        model: [
          { model_id: 21, model_sku: "CAM-BR-P", tier_index: [0, 0] },
          { model_id: 22, model_sku: " ", tier_index: [1, 1] },
        ],
      },
    );
    expect(rows.map((r) => [r.external_model_id, r.title, r.external_sku, r.status])).toEqual([
      ["21", "Camiseta — Branca / P", "CAM-BR-P", "inativo"],
      ["22", "Camiseta — Preta / M", "CAM", "inativo"],
    ]);
  });

  it("prazo: até 3 dias é envio normal; acima, pré-encomenda dentro da faixa", () => {
    expect(daysToShip(0)).toEqual({ is_pre_order: false, days_to_ship: 1 });
    expect(daysToShip(3)).toEqual({ is_pre_order: false, days_to_ship: 3 });
    expect(daysToShip(4)).toEqual({ is_pre_order: true, days_to_ship: 7 });
    expect(daysToShip(12)).toEqual({ is_pre_order: true, days_to_ship: 12 });
    expect(daysToShip(60)).toEqual({ is_pre_order: true, days_to_ship: 30 });
  });

  it("lista ativos e pausados com paginação", async () => {
    const { fetchImpl, calls } = fake([
      { response: { item: [{ item_id: 1 }], has_next_page: true, next_offset: 100 } },
      { response: { item: [{ item_id: 2 }], has_next_page: false } },
      { response: { item: [{ item_id: 3 }], has_next_page: false } },
    ]);
    expect(await listItemIds(config, shop, { fetchImpl })).toEqual([1, 2, 3]);
    expect(
      calls.map((c) => [c.url.searchParams.get("item_status"), c.url.searchParams.get("offset")]),
    ).toEqual([
      ["NORMAL", "0"],
      ["NORMAL", "100"],
      ["UNLIST", "0"],
    ]);
  });

  it("envia estoque por variação e devolve as recusadas", async () => {
    const { fetchImpl, calls } = fake([
      { response: { failure_list: [{ model_id: 22, failed_reason: "Variação bloqueada" }] } },
    ]);
    const failed = await updateStock(
      config,
      shop,
      "2",
      [
        { modelId: "21", stock: 9.7 },
        { modelId: "22", stock: -3 },
      ],
      { fetchImpl },
    );
    expect(calls[0].body).toEqual({
      item_id: 2,
      stock_list: [
        { model_id: 21, seller_stock: [{ stock: 9 }] },
        { model_id: 22, seller_stock: [{ stock: 0 }] },
      ],
    });
    expect(failed.get("22")).toBe("Variação bloqueada");
    expect(failed.has("21")).toBe(false);
  });
});

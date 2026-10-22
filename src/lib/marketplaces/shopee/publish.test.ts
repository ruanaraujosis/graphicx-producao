// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { publicationProblems } from "../publication";
import type { ShopeeConfig } from "./config";
import {
  addItemBody,
  initTierVariation,
  optionNames,
  type PublishInput,
  tierBody,
  toAttributes,
  uploadImage,
  withPaths,
} from "./publish";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};
const shop = { shopId: 555, accessToken: "tok" };

const variant = (sku: string, name: string, price: number, stock: number, weight_g = 300) => ({
  variant_id: `v-${sku}`,
  sku,
  name,
  price,
  stock,
  weight_g,
  length_cm: 10,
  width_cm: 8.2,
  height_cm: 12,
});

const base: PublishInput = {
  title: "Caneca personalizada 325ml",
  description: "Caneca de cerâmica com a sua arte, pronta para presente.",
  categoryId: 100,
  attributes: [
    { attribute_id: 1, values: [{ value_id: 11 }] },
    { attribute_id: 2, values: [] },
  ],
  logistics: [90001, 90002],
  itemStatus: "NORMAL",
  productionDays: 5,
  imageIds: Array.from({ length: 12 }, (_, i) => `img${i}`),
  variants: [variant("CAN-B", "Branca", 39.9, 9)],
};

describe("publicar na Shopee", () => {
  it("monta o caminho das categorias", () => {
    const cats = withPaths([
      { category_id: 1, display_category_name: "Casa", has_children: true },
      {
        category_id: 2,
        parent_category_id: 1,
        display_category_name: "Cozinha",
        has_children: true,
      },
      { category_id: 3, parent_category_id: 2, original_category_name: "Canecas" },
    ]);
    expect(cats[2]).toEqual({
      category_id: 3,
      parent_id: 2,
      name: "Canecas",
      path: "Casa > Cozinha > Canecas",
      has_children: false,
    });
    expect(cats[0].parent_id).toBeNull();
  });

  it("atributos: obrigatórios primeiro e tipo de campo", () => {
    const attrs = toAttributes([
      { attribute_id: 5, display_attribute_name: "Material", input_type: "TEXT_FILED" },
      {
        attribute_id: 6,
        display_attribute_name: "Marca",
        is_mandatory: true,
        input_type: "DROP_DOWN",
        attribute_value_list: [{ value_id: 1, display_value_name: "Sem marca" }],
      },
      { attribute_id: 7, original_attribute_name: "Cor", input_type: "MULTIPLE_SELECT" },
    ]);
    expect(attrs.map((a) => [a.name, a.kind, a.mandatory])).toEqual([
      ["Marca", "select", true],
      ["Cor", "multi", false],
      ["Material", "text", false],
    ]);
  });

  it("anúncio com uma variação: preço, estoque, SKU, peso em kg, prazo e até 9 fotos", () => {
    const body = addItemBody(base);
    expect(body).toMatchObject({
      item_name: "Caneca personalizada 325ml",
      category_id: 100,
      original_price: 39.9,
      seller_stock: [{ stock: 9 }],
      item_sku: "CAN-B",
      weight: 0.3,
      dimension: { package_length: 10, package_width: 9, package_height: 12 },
      logistic_info: [
        { logistic_id: 90001, enabled: true },
        { logistic_id: 90002, enabled: true },
      ],
      attribute_list: [{ attribute_id: 1, values: [{ value_id: 11 }] }],
      pre_order: { is_pre_order: true, days_to_ship: 7 },
      item_status: "NORMAL",
    });
    expect(body.image.image_id_list).toHaveLength(9);
  });

  it("anúncio com variações: menor preço no item e variações no init_tier_variation", () => {
    const variants = [variant("CAN-B", "Branca", 39.9, 9), variant("CAN-P", "Preta", 44.9, 3, 350)];
    const body = addItemBody({ ...base, variants });
    expect(body.original_price).toBe(39.9);
    expect(body.weight).toBe(0.35);
    expect("item_sku" in body).toBe(false);
    expect(tierBody(77, variants)).toEqual({
      item_id: 77,
      tier_variation: [
        { name: "Variação", option_list: [{ option: "Branca" }, { option: "Preta" }] },
      ],
      model: [
        { tier_index: [0], original_price: 39.9, model_sku: "CAN-B", seller_stock: [{ stock: 9 }] },
        { tier_index: [1], original_price: 44.9, model_sku: "CAN-P", seller_stock: [{ stock: 3 }] },
      ],
    });
  });

  it("nomes das opções: corta no limite e não repete", () => {
    expect(
      optionNames([
        { name: "Branca" },
        { name: "branca" },
        { name: "x".repeat(30) },
        { name: " " },
      ]),
    ).toEqual(["Branca", "branca 2", "x".repeat(20), "Opção 4"]);
  });

  it("liga cada variação ao model_id devolvido", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              model: [
                { model_id: 902, tier_index: [1], model_sku: "CAN-P" },
                { model_id: 901, tier_index: [0], model_sku: "CAN-B" },
              ],
            },
          }),
        ),
    ) as unknown as typeof fetch;
    const links = await initTierVariation(
      config,
      shop,
      77,
      [variant("CAN-B", "Branca", 39.9, 9), variant("CAN-P", "Preta", 44.9, 3)],
      { fetchImpl },
    );
    expect(links).toEqual([
      { variant_id: "v-CAN-B", model_id: "901" },
      { variant_id: "v-CAN-P", model_id: "902" },
    ]);
  });

  it("envia a foto como arquivo, sem dados da loja na URL", async () => {
    let sent: { url: URL; body: unknown } | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent = { url: new URL(String(input)), body: init?.body };
      return new Response(JSON.stringify({ response: { image_info: { image_id: "abc" } } }));
    }) as unknown as typeof fetch;
    expect(await uploadImage(config, new Uint8Array([1, 2, 3]), "foto.jpg", { fetchImpl })).toBe(
      "abc",
    );
    expect(sent!.url.pathname).toBe("/api/v2/media_space/upload_image");
    expect(sent!.url.searchParams.has("access_token")).toBe(false);
    expect(sent!.body).toBeInstanceOf(FormData);
  });

  it("lista o que falta antes de publicar", () => {
    expect(
      publicationProblems({
        title: "Curto",
        description: "pouco",
        category_id: null,
        logistics: [],
        images: 0,
        productActive: true,
        variants: [{ sku: "A", price: 0, stock: null, weight_g: null }],
      }),
    ).toEqual([
      "O título precisa ter de 10 a 120 caracteres.",
      "A descrição precisa ter pelo menos 20 caracteres.",
      "Escolha a categoria da Shopee.",
      "Escolha pelo menos uma forma de envio.",
      "Cadastre pelo menos uma foto do produto.",
      "Informe o peso da variação A.",
      "A variação A está sem preço.",
      "A variação A é sob encomenda e não tem ficha técnica: cadastre os insumos para calcular o estoque.",
    ]);
  });
});

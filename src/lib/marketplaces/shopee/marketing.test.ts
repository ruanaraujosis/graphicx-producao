// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buyerFirstName, fillReply, suggestReply } from "../replies";
import type { ShopeeConfig } from "./config";
import { getComments, pickBoostItems, replyComments } from "./marketing";

const config: ShopeeConfig = {
  partnerId: 1000001,
  partnerKey: "chave-de-teste-nao-real",
  host: "https://shopee.test",
  sandbox: true,
};
const shop = { shopId: 555, accessToken: "tok" };

const item = (id: string, position: number, extra: object = {}) => ({
  external_item_id: id,
  position,
  active: true,
  last_boosted_at: null as string | null,
  stock: 10 as number | null,
  ...extra,
});

describe("impulsionamento", () => {
  it("primeira rodada: os 5 primeiros da lista", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => item(id, i));
    expect(pickBoostItems(list, [])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("rodízio: quem foi impulsionado há mais tempo vem antes", () => {
    const t = (h: number) => new Date(Date.UTC(2026, 9, 23, h)).toISOString();
    const list = [
      item("a", 0, { last_boosted_at: t(8) }),
      item("b", 1, { last_boosted_at: t(8) }),
      item("c", 2),
      item("d", 3, { last_boosted_at: t(4) }),
    ];
    expect(pickBoostItems(list, [])).toEqual(["c", "d", "a", "b"]);
  });

  it("pula pausados, sem estoque e os que ainda estão impulsionados; respeita as vagas", () => {
    const list = [
      item("a", 0, { active: false }),
      item("b", 1, { stock: 0 }),
      item("c", 2),
      item("d", 3, { stock: null }),
      item("e", 4),
      item("f", 5),
    ];
    expect(pickBoostItems(list, ["e", "x", "y"])).toEqual(["c", "d"]);
  });
});

describe("respostas às avaliações", () => {
  it("usa o modelo da gráfica para a faixa, senão o padrão", () => {
    const vars = { comprador: "Ana", produto: "Caneca", loja: "Smart" };
    expect(
      suggestReply({
        rating: 5,
        templates: [{ min_stars: 4, max_stars: 5, body: "Valeu, {comprador}! — {loja}" }],
        vars,
        seed: "1",
      }),
    ).toBe("Valeu, Ana! — Smart");
    expect(suggestReply({ rating: 2, templates: [], vars, seed: "1" })).toContain("sentimos muito");
  });

  it("escolhe sempre o mesmo modelo para a mesma avaliação", () => {
    const templates = [
      { min_stars: 5, max_stars: 5, body: "Um {comprador}" },
      { min_stars: 5, max_stars: 5, body: "Dois {comprador}" },
    ];
    const vars = { comprador: "Ana", produto: "", loja: "" };
    const a = suggestReply({ rating: 5, templates, vars, seed: "abc" });
    expect(suggestReply({ rating: 5, templates, vars, seed: "abc" })).toBe(a);
  });

  it("campos vazios ganham um texto neutro", () => {
    expect(fillReply("Oi {comprador}, {produto}!", { comprador: "", produto: "", loja: "" })).toBe(
      "Oi cliente, o produto!",
    );
  });

  it("primeiro nome a partir do usuário da Shopee", () => {
    expect(buyerFirstName("maria.souza92")).toBe("Maria");
    expect(buyerFirstName("JOAO_P")).toBe("Joao");
    expect(buyerFirstName(null)).toBe("");
  });
});

describe("API de avaliações", () => {
  it("lê as páginas e envia as respostas, devolvendo as recusadas", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const responses = [
      {
        response: {
          item_comment_list: [{ comment_id: 1, rating_star: 5 }],
          more: true,
          next_cursor: "2",
        },
      },
      { response: { item_comment_list: [{ comment_id: 2, rating_star: 1 }], more: false } },
      {
        response: {
          result_list: [{ comment_id: 2, fail_error: "x", fail_message: "Já respondida" }],
        },
      },
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        path: new URL(String(input)).pathname,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify(responses.shift()));
    }) as unknown as typeof fetch;

    const comments = await getComments(config, shop, { fetchImpl });
    expect(comments.map((c) => c.comment_id)).toEqual([1, 2]);
    const failed = await replyComments(
      config,
      shop,
      [
        { commentId: "1", text: "Obrigado!" },
        { commentId: "2", text: "Sentimos muito" },
      ],
      { fetchImpl },
    );
    expect(calls[2].path).toBe("/api/v2/product/reply_comment");
    expect(calls[2].body).toEqual({
      comment_list: [
        { comment_id: 1, comment: "Obrigado!" },
        { comment_id: 2, comment: "Sentimos muito" },
      ],
    });
    expect(Object.fromEntries(failed)).toEqual({ "2": "Já respondida" });
  });
});

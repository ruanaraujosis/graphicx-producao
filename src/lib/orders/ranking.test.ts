import { describe, expect, it } from "vitest";
import { rankBy, uniqueByOrder } from "./ranking";

describe("ranking da equipe", () => {
  const rows = [
    { userId: "ana", total: 100 },
    { userId: "ana", total: "50.5" },
    { userId: "bia", total: 300 },
    { userId: null, total: 999 },
  ];

  it("ordena por quantidade e ignora linhas sem autor", () => {
    expect(rankBy(rows)).toEqual([
      { userId: "ana", count: 2, total: 150.5 },
      { userId: "bia", count: 1, total: 300 },
    ]);
  });

  it("ordena por valor quando pedido", () => {
    expect(rankBy(rows, "total").map((r) => r.userId)).toEqual(["bia", "ana"]);
  });

  it("limita o tamanho", () => {
    expect(rankBy(rows, "count", 1)).toHaveLength(1);
  });

  it("conta cada pedido uma vez por pessoa", () => {
    const events = [
      { order_id: "1", actor_id: "ana" },
      { order_id: "1", actor_id: "ana" },
      { order_id: "1", actor_id: "bia" },
      { order_id: "2", actor_id: "ana" },
    ];
    expect(uniqueByOrder(events)).toHaveLength(3);
  });
});

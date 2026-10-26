import { describe, expect, it } from "vitest";
import { teamStats } from "./ranking";

describe("ranking da equipe", () => {
  const members = [
    { userId: "ana", name: "Ana", role: "Vendas" },
    { userId: "bia", name: "Bia", role: "Produção" },
    { userId: "caio", name: "Caio", role: null },
  ];
  const sales = [
    { userId: "ana", total: 100, at: "2026-10-05T12:00:00Z" },
    { userId: "ana", total: "50.5", at: "2026-10-20T12:00:00Z" },
    { userId: "bia", total: 300, at: "2026-10-10T12:00:00Z" },
    { userId: "bia", total: 999, at: "2026-09-30T12:00:00Z" },
    { userId: null, total: 999, at: "2026-10-10T12:00:00Z" },
  ];
  const produced = [
    { userId: "ana", orderId: "1", at: "2026-10-02T12:00:00Z" },
    { userId: "caio", orderId: "1", at: "2026-10-02T12:00:00Z" },
    { userId: "caio", orderId: "1", at: "2026-10-03T12:00:00Z" },
    { userId: "caio", orderId: "2", at: "2026-10-03T12:00:00Z" },
  ];
  const rates = new Map([["ana", 10]]);
  const october = teamStats(members, sales, produced, rates, "2026-10-01T03:00:00Z");

  it("ordena por vendas e inclui quem não vendeu", () => {
    expect(october.map((m) => m.userId)).toEqual(["bia", "ana", "caio"]);
  });

  it("soma vendas, pedidos, ticket médio e última venda do período", () => {
    const ana = october.find((m) => m.userId === "ana")!;
    expect(ana).toMatchObject({
      sales: 150.5,
      orders: 2,
      avgTicket: 75.25,
      lastSaleAt: "2026-10-20T12:00:00Z",
    });
  });

  it("calcula a comissão pelo percentual definido", () => {
    expect(october.find((m) => m.userId === "ana")).toMatchObject({
      commissionRate: 10,
      commission: 15.05,
    });
    expect(october.find((m) => m.userId === "bia")).toMatchObject({
      commissionRate: null,
      commission: 0,
    });
  });

  it("conta cada pedido produzido uma vez por pessoa", () => {
    expect(october.find((m) => m.userId === "caio")?.produced).toBe(2);
    expect(october.find((m) => m.userId === "ana")?.produced).toBe(1);
  });

  it("respeita o fim do período", () => {
    const september = teamStats(
      members,
      sales,
      produced,
      rates,
      "2026-09-01T03:00:00Z",
      "2026-10-01T03:00:00Z",
    );
    expect(september[0]).toMatchObject({ userId: "bia", sales: 999, orders: 1 });
  });
});

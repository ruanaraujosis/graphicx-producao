import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availableUnits, bomConsumption, producibleUnits, suggestedPurchase } from "./availability";
import { bomUnitCost, weightedAverageCost } from "./cost";
import { MOVEMENT_TYPES, UNITS, onHandDelta } from "./units";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261010000000_cadastros_estoque.sql"),
  "utf8",
);

describe("custo médio ponderado", () => {
  it("pondera o saldo atual com a entrada", () => {
    // 100 folhas a R$ 0,10 + 100 folhas a R$ 0,20 → R$ 0,15
    expect(
      weightedAverageCost({ onHand: 100, avgCost: 0.1, entryQuantity: 100, entryUnitCost: 0.2 }),
    ).toBe(0.15);
  });

  it("primeira entrada define o custo", () => {
    expect(
      weightedAverageCost({ onHand: 0, avgCost: 0, entryQuantity: 50, entryUnitCost: 3.4567 }),
    ).toBe(3.4567);
  });

  it("saldo negativo conta como zero", () => {
    expect(
      weightedAverageCost({ onHand: -20, avgCost: 9, entryQuantity: 10, entryUnitCost: 2 }),
    ).toBe(2);
  });
});

describe("ficha técnica", () => {
  // Bloco A5 de 50 folhas: 50 folhas de sulfite (5% de perda) + 1 capa.
  const bloco = [
    { quantity: 50, wastePct: 5, available: 2000 }, // sulfite: 2000 / 52,5 = 38
    { quantity: 1, wastePct: 0, available: 100 }, // capa: 100
  ];

  it("o insumo mais escasso limita a produção", () => {
    expect(producibleUnits(bloco)).toBe(38);
  });

  it("sem ficha técnica não dá para calcular", () => {
    expect(producibleUnits([])).toBeNull();
  });

  it("saldo negativo do insumo não produz nada", () => {
    expect(producibleUnits([{ quantity: 1, wastePct: 0, available: -5 }])).toBe(0);
  });

  it("pronta-entrega soma as peças prontas; sob encomenda não", () => {
    expect(availableUnits({ fulfillment: "pronta_entrega", readyAvailable: 12, bom: bloco })).toBe(
      50,
    );
    expect(availableUnits({ fulfillment: "sob_encomenda", readyAvailable: 12, bom: bloco })).toBe(
      38,
    );
  });

  it("baixa de 10 blocos consome 525 folhas (com 5% de perda)", () => {
    expect(bomConsumption(10, bloco[0])).toBe(525);
  });

  it("custo de uma unidade inclui a perda", () => {
    expect(
      bomUnitCost([
        { quantity: 50, wastePct: 5, avgCost: 0.04 },
        { quantity: 1, wastePct: 0, avgCost: 1.5 },
      ]),
    ).toBe(3.6);
  });
});

describe("sugestão de compra", () => {
  it("repõe até 2× o mínimo quando abaixo", () => {
    expect(suggestedPurchase({ minStock: 100, available: 30 })).toBe(170);
  });
  it("não sugere quando está acima do mínimo ou sem mínimo", () => {
    expect(suggestedPurchase({ minStock: 100, available: 100 })).toBe(0);
    expect(suggestedPurchase({ minStock: 0, available: -5 })).toBe(0);
  });
});

describe("movimentações", () => {
  it("efeito no saldo físico", () => {
    expect(onHandDelta("entrada", 5)).toBe(5);
    expect(onHandDelta("perda", 5)).toBe(-5);
    expect(onHandDelta("ajuste", -3)).toBe(-3);
    expect(onHandDelta("reserva", 5)).toBe(0);
  });

  it("tipos iguais ao enum do banco", () => {
    const match = migration.match(/create type public\.stock_movement_type as enum \(([^)]+)\)/);
    expect([...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...MOVEMENT_TYPES]);
  });

  it("unidades iguais ao check do banco", () => {
    const match = migration.match(/unit text not null check \(unit in \(([^)]+)\)\)/);
    expect([...match![1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])).toEqual([...UNITS]);
  });
});

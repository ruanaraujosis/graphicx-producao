import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SALES_CHANNELS, channelPrice, grossMarginPct, roundCents } from "./pricing";

describe("channelPrice", () => {
  it("usa o preço base sem ajuste", () => {
    expect(channelPrice({ basePrice: 25 })).toBe(25);
  });

  it("aplica o ajuste % do canal", () => {
    expect(channelPrice({ basePrice: 25, adjustmentPct: 20 })).toBe(30);
    expect(channelPrice({ basePrice: 19.9, adjustmentPct: 15 })).toBe(22.89);
  });

  it("aceita ajuste negativo (desconto)", () => {
    expect(channelPrice({ basePrice: 100, adjustmentPct: -10 })).toBe(90);
  });

  it("o preço manual do canal substitui a regra", () => {
    expect(channelPrice({ basePrice: 25, adjustmentPct: 20, override: 27.5 })).toBe(27.5);
    expect(channelPrice({ basePrice: 25, adjustmentPct: 20, override: 0 })).toBe(0);
  });

  it("arredonda centavos como o Postgres", () => {
    expect(roundCents(10.005)).toBe(10.01);
    expect(roundCents(2.675)).toBe(2.68);
  });
});

describe("grossMarginPct", () => {
  it("calcula a margem sobre o preço", () => {
    expect(grossMarginPct(50, 20)).toBe(60);
    expect(grossMarginPct(0, 20)).toBeNull();
  });
});

describe("canais", () => {
  it("são os mesmos do enum sales_channel no banco (última definição)", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir)
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const match = [...sql.matchAll(/create type public\.sales_channel as enum \(([^)]+)\)/g)].at(
      -1,
    );
    const values = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...SALES_CHANNELS]);
  });
});

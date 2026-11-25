import { describe, expect, it } from "vitest";
import { code39Svg, code39Widths } from "./code39";

describe("Code 39", () => {
  it("cada caractere tem 5 barras e 4 espaços, 3 deles largos", () => {
    const widths = code39Widths("1042");
    // 6 caracteres (* + 4 dígitos + *) × 9 elementos + 5 espaços entre eles.
    expect(widths).toHaveLength(6 * 9 + 5);
    for (let c = 0; c < 6; c++) {
      const chunk = widths.slice(c * 10, c * 10 + 9);
      expect(chunk.filter((w) => w === 3)).toHaveLength(3);
    }
  });

  it("começa e termina com o * (barra estreita, espaço largo)", () => {
    const widths = code39Widths("7");
    expect(widths.slice(0, 9)).toEqual([1, 3, 1, 1, 3, 1, 3, 1, 1]);
    expect(widths.slice(-9)).toEqual([1, 3, 1, 1, 3, 1, 3, 1, 1]);
  });

  it("só aceita números", () => {
    expect(() => code39Widths("A1")).toThrow();
    expect(() => code39Widths("")).toThrow();
  });

  it("gera um SVG com as barras", () => {
    const svg = code39Svg("1001");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<rect x=/g)).toHaveLength(6 * 5);
  });
});

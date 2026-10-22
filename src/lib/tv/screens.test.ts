import { describe, expect, it } from "vitest";
import { isTvScreen, screenForPath } from "./screens";

describe("Reproduzir na TV", () => {
  it("cada página manda a tela correspondente", () => {
    expect(screenForPath("/pcp")).toBe("board");
    expect(screenForPath("/inicio")).toBe("board");
    expect(screenForPath("/pedidos/123")).toBe("due");
    expect(screenForPath("/expedicao")).toBe("due");
    expect(screenForPath("/artes")).toBe("art");
    expect(screenForPath("/financeiro/dre")).toBe("revenue");
    expect(screenForPath("/estoque/insumos")).toBe("stock");
  });

  it("outras páginas mandam o painel completo", () => {
    expect(screenForPath("/configuracoes")).toBeNull();
    expect(screenForPath("/")).toBeNull();
  });

  it("só aceita telas conhecidas", () => {
    expect(isTvScreen("stock")).toBe(true);
    expect(isTvScreen("qualquer")).toBe(false);
    expect(isTvScreen(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("mantém caminhos internos", () => {
    expect(safeNextPath("/configuracoes/usuarios?x=1")).toBe("/configuracoes/usuarios?x=1");
  });

  it.each([undefined, null, "", "https://evil.com", "//evil.com", "/\\evil.com", "/login"])(
    "volta para o início com %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/inicio");
    },
  );
});

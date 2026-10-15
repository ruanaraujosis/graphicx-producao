// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  formatPairingCode,
  hashPairingSecret,
  newPairingCode,
  newPairingSecret,
  normalizePairingCode,
} from "./pairing";

describe("pareamento da TV", () => {
  it("gera códigos de 6 caracteres sem letras confusas", () => {
    for (let i = 0; i < 200; i++) {
      const code = newPairingCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });

  it("aceita o código digitado com espaço, hífen ou minúsculas", () => {
    expect(normalizePairingCode("abc 234")).toBe("ABC234");
    expect(normalizePairingCode(" ab-c23 4 ")).toBe("ABC234");
    expect(normalizePairingCode("ABC10O")).toBeNull();
    expect(normalizePairingCode("ABC23")).toBeNull();
  });

  it("mostra o código em dois blocos", () => {
    expect(formatPairingCode("ABC234")).toBe("ABC 234");
  });

  it("segredo longo e guardado só como hash", () => {
    const secret = newPairingSecret();
    expect(secret.length).toBeGreaterThanOrEqual(40);
    expect(hashPairingSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPairingSecret(secret)).not.toContain(secret);
  });
});

// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup, isEncryptedBackup, parseBackupKey } from "./crypto";

const newKey = () => parseBackupKey(randomBytes(32).toString("base64"))!;
const ORG = "10000000-0000-0000-0000-000000000001";

describe("criptografia dos backups", () => {
  it("abre o que criptografou e devolve a gráfica do arquivo", () => {
    const key = newKey();
    const plain = Buffer.from(JSON.stringify({ clientes: ["Maria"] }));
    const file = encryptBackup(plain, ORG, key);
    expect(isEncryptedBackup(file)).toBe(true);
    expect(file.includes(Buffer.from("Maria"))).toBe(false);
    expect(decryptBackup(file, key)).toEqual({ plain, organizationId: ORG });
  });

  it("cada arquivo usa um IV novo", () => {
    const key = newKey();
    const plain = Buffer.from("mesmo conteúdo");
    expect(encryptBackup(plain, ORG, key).equals(encryptBackup(plain, ORG, key))).toBe(false);
  });

  it("recusa outra chave", () => {
    const file = encryptBackup(Buffer.from("x"), ORG, newKey());
    expect(() => decryptBackup(file, newKey())).toThrow("outra chave");
  });

  it("detecta adulteração do conteúdo e troca de gráfica no cabeçalho", () => {
    const key = newKey();
    const file = encryptBackup(Buffer.from("conteúdo da gráfica"), ORG, key);
    const body = Buffer.from(file);
    body[body.length - 1] ^= 1;
    expect(() => decryptBackup(body, key)).toThrow("integridade");
    const swapped = Buffer.from(file);
    swapped[13] = "2".charCodeAt(0); // primeiro caractere do id da gráfica
    expect(() => decryptBackup(swapped, key)).toThrow("integridade");
  });

  it("valida a chave: vazia é null; tamanho errado é erro", () => {
    expect(parseBackupKey(undefined)).toBeNull();
    expect(parseBackupKey("  ")).toBeNull();
    expect(() => parseBackupKey(randomBytes(16).toString("base64"))).toThrow("32 bytes");
    expect(() => parseBackupKey("não é base64!")).toThrow("32 bytes");
    expect(newKey().fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

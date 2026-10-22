import { describe, expect, it } from "vitest";
import { formatCep, formatDocument, formatPhone, isValidCnpj, isValidCpf } from "./documents";

describe("CPF", () => {
  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("recusa dígito errado, sequência repetida e tamanho errado", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
});

describe("formatação", () => {
  it("formata documentos, telefone e CEP", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("5511987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatCep("01310100")).toBe("01310-100");
  });
});

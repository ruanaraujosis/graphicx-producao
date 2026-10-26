// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { toCsv, toXlsx } = await import("./table");

type Row = { name: string; value: number; due: string };
const columns = [
  { header: "Nome", value: (r: Row) => r.name },
  { header: "Valor", value: (r: Row) => r.value, type: "money" as const },
  { header: "Vencimento", value: (r: Row) => r.due, type: "date" as const },
];

describe("exportação", () => {
  it("CSV no padrão brasileiro, com BOM e escape", () => {
    const csv = toCsv(columns, [
      { name: "Aluguel; galpão", value: 1500.5, due: "2026-10-05" },
      { name: 'Papel "A4"', value: 0.06, due: "2026-11-01" },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Nome;Valor;Vencimento\r\n");
    expect(csv).toContain('"Aluguel; galpão";1.500,50;05/10/2026');
    expect(csv).toContain('"Papel ""A4""";0,06;01/11/2026');
  });

  it("Excel gera um .xlsx (zip)", async () => {
    const buffer = await toXlsx(columns, [{ name: "Teste", value: 10, due: "2026-10-05" }]);
    expect(buffer.length).toBeGreaterThan(1000);
    // Arquivos .xlsx são zip: começam com "PK".
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
  });
});

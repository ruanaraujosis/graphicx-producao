import "server-only";
import writeExcelFile from "write-excel-file/node";

/** Coluna de uma tabela exportável. `money` e `date` ganham formato no Excel. */
export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
  type?: "text" | "number" | "money" | "date";
};

const BRL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function csvCell(value: string) {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** "2026-10-11" → "11/10/2026" (sem passar por fuso). */
function brDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/**
 * CSV no padrão brasileiro: separador ";", vírgula decimal e BOM para o Excel
 * reconhecer os acentos.
 */
export function toCsv<T>(columns: readonly ExportColumn<T>[], rows: readonly T[]) {
  const lines = [columns.map((c) => csvCell(c.header)).join(";")];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined || v === "") return "";
          if (typeof v === "number") return c.type === "money" ? BRL.format(v) : NUM.format(v);
          return csvCell(c.type === "date" ? brDate(v) : v);
        })
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Planilha .xlsx com cabeçalho em negrito, moeda em R$ e datas formatadas. */
export async function toXlsx<T>(columns: readonly ExportColumn<T>[], rows: readonly T[]) {
  const header = columns.map((c) => ({ value: c.header, fontWeight: "bold" as const }));
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      if (v === null || v === undefined || v === "") return null;
      if (c.type === "money" && typeof v === "number") {
        return { value: v, format: '"R$" #,##0.00' };
      }
      if (c.type === "date" && typeof v === "string") {
        return { value: new Date(`${v.slice(0, 10)}T12:00:00Z`), format: "dd/mm/yyyy" };
      }
      return { value: v };
    }),
  );
  return writeExcelFile([header, ...body]).toBuffer();
}

import { TIME_ZONE } from "@/lib/format";

/** Mês dos relatórios (?mes=AAAA-MM). Sem parâmetro (ou inválido) = mês atual em São Paulo. */
export function parseMonth(param: unknown, todayIso: string) {
  const fallback = todayIso.slice(0, 7);
  const value =
    typeof param === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : fallback;
  const [y, m] = value.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(Date.UTC(y, m - 1, 15, 12)));
  return {
    month: value,
    from: `${value}-01`,
    to: `${value}-${pad(last)}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    prev: shift(-1),
    next: shift(1),
    isCurrent: value === fallback,
  };
}

/** Os últimos N meses até o informado (inclusive), para o DRE. */
export function lastMonths(monthIso: string, count: number) {
  const [y, m] = monthIso.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - count, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

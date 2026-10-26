export const TIME_ZONE = "America/Sao_Paulo";
export const LOCALE = "pt-BR";

const currency = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});
const date = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, dateStyle: "short" });

export function formatCurrency(value: number) {
  return currency.format(value);
}

const percent = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/** Recebe o valor já em pontos percentuais (12.5 → "12,5%"). */
export function formatPercent(value: number) {
  return `${percent.format(value)}%`;
}

export function formatDateTime(value: string | Date) {
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: string | Date) {
  return date.format(typeof value === "string" ? new Date(value) : value);
}

/** Iniciais para avatar: primeira letra do primeiro e do último nome. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

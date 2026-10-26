import { TIME_ZONE } from "@/lib/format";

/** Data de hoje em São Paulo, no formato do banco (AAAA-MM-DD). */
export function todayIso(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Datas AAAA-MM-DD tratadas ao meio-dia UTC para não "voltar um dia" com fuso. */
function parse(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function format(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Soma (ou subtrai) dias corridos. */
export function addDays(fromIso: string, days: number) {
  const d = parse(fromIso);
  d.setUTCDate(d.getUTCDate() + Math.trunc(days));
  return format(d);
}

/** Soma dias úteis (seg–sex). Feriados ainda não entram na conta. */
export function addBusinessDays(fromIso: string, days: number) {
  const d = parse(fromIso);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return format(d);
}

/** Diferença em dias corridos (b − a). */
export function daysBetween(aIso: string, bIso: string) {
  return Math.round((parse(bIso).getTime() - parse(aIso).getTime()) / 86_400_000);
}

export type DueRisk = "atrasado" | "hoje" | "amanha" | "ok";

/** Situação do prazo de um pedido aberto. */
export function dueRisk(dueIso: string | null, today: string = todayIso()): DueRisk | null {
  if (!dueIso) return null;
  const diff = daysBetween(today, dueIso);
  if (diff < 0) return "atrasado";
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanha";
  return "ok";
}

export const DUE_RISK_LABELS: Record<DueRisk, string> = {
  atrasado: "Atrasado",
  hoje: "Posta hoje",
  amanha: "Posta amanhã",
  ok: "No prazo",
};

/** "12/10" a partir de AAAA-MM-DD, sem passar por fuso. */
export function formatDueDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

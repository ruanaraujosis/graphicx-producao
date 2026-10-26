/**
 * Metas a partir da meta mensal: o dia e a semana valem pelos dias úteis (seg–sex).
 * Feriados ainda não entram na conta.
 */

function parse(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function isBusinessDay(d: Date) {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Dias úteis do mês da data. */
export function businessDaysInMonth(iso: string) {
  const d = parse(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  let count = 0;
  for (
    let day = new Date(Date.UTC(year, month, 1, 12));
    day.getUTCMonth() === month;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    if (isBusinessDay(day)) count++;
  }
  return count;
}

/** Dias úteis da semana (seg–dom) da data que caem dentro do mesmo mês. */
export function businessDaysInWeekWithinMonth(iso: string) {
  const d = parse(iso);
  const month = d.getUTCMonth();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    if (day.getUTCMonth() === month && isBusinessDay(day)) count++;
  }
  return count;
}

export type Goals = { month: number; week: number; day: number };

/** Meta do mês, da semana e do dia (0 quando não há meta). */
export function goalsFromMonthly(monthlyGoal: number | null | undefined, todayIso: string): Goals {
  const month = monthlyGoal && monthlyGoal > 0 ? monthlyGoal : 0;
  const days = businessDaysInMonth(todayIso);
  const day = days > 0 ? month / days : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    month: round(month),
    week: round(day * businessDaysInWeekWithinMonth(todayIso)),
    day: round(day),
  };
}

/** Percentual atingido (0–999), para barras de progresso. */
export function progressPct(value: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.min(999, Math.round((value / goal) * 100));
}

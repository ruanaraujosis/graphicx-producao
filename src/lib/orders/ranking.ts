/**
 * Ranking da equipe no Início: quem mais vendeu (pedidos confirmados que a
 * pessoa lançou) e quem mais produziu (pedidos que a pessoa levou à Expedição).
 */

export type RankingEntry = { userId: string; count: number; total: number };

/** Soma por pessoa; linhas sem autor (Shopee, rotinas) ficam de fora. */
export function rankBy(
  rows: { userId: string | null; total?: number | string | null }[],
  sortBy: "count" | "total" = "count",
  limit = 5,
): RankingEntry[] {
  const byUser = new Map<string, RankingEntry>();
  for (const row of rows) {
    if (!row.userId) continue;
    const entry = byUser.get(row.userId) ?? { userId: row.userId, count: 0, total: 0 };
    entry.count++;
    entry.total += Number(row.total ?? 0);
    byUser.set(row.userId, entry);
  }
  return [...byUser.values()]
    .sort((a, b) =>
      sortBy === "total"
        ? b.total - a.total || b.count - a.count
        : b.count - a.count || b.total - a.total,
    )
    .slice(0, limit);
}

/** Um pedido conta uma vez por pessoa, mesmo que volte e passe de novo pela etapa. */
export function uniqueByOrder<T extends { order_id: string; actor_id: string | null }>(
  events: T[],
) {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.order_id}:${e.actor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

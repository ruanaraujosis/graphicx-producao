/**
 * Ranking da equipe no Início: quem mais vendeu (pedidos confirmados que a
 * pessoa lançou), a comissão sobre essas vendas e quem mais produziu
 * (pedidos que a pessoa levou à Expedição).
 */

export type TeamMember = { userId: string; name: string; role: string | null };
export type SaleRow = { userId: string | null; total: number | string | null; at: string };
export type ProducedRow = { userId: string | null; orderId: string; at: string };

export type MemberStats = TeamMember & {
  sales: number;
  orders: number;
  avgTicket: number;
  /** Percentual definido pelo financeiro; nulo = sem comissão. */
  commissionRate: number | null;
  commission: number;
  produced: number;
  lastSaleAt: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Números de cada pessoa da equipe no período [from, to).
 * Linhas sem autor (Shopee, rotinas) ficam de fora; um pedido conta uma vez
 * por pessoa na produção, mesmo que volte e passe de novo pela etapa.
 */
export function teamStats(
  members: TeamMember[],
  sales: SaleRow[],
  produced: ProducedRow[],
  rates: Map<string, number>,
  from: string,
  to?: string,
): MemberStats[] {
  const inPeriod = (at: string) => {
    const t = new Date(at).getTime();
    return t >= new Date(from).getTime() && (!to || t < new Date(to).getTime());
  };
  const byUser = new Map<string, MemberStats>(
    members.map((m) => [
      m.userId,
      {
        ...m,
        sales: 0,
        orders: 0,
        avgTicket: 0,
        commissionRate: rates.get(m.userId) ?? null,
        commission: 0,
        produced: 0,
        lastSaleAt: null,
      },
    ]),
  );

  for (const s of sales) {
    const entry = s.userId ? byUser.get(s.userId) : undefined;
    if (!entry || !inPeriod(s.at)) continue;
    entry.sales += Number(s.total ?? 0);
    entry.orders++;
    if (!entry.lastSaleAt || s.at > entry.lastSaleAt) entry.lastSaleAt = s.at;
  }

  const seen = new Set<string>();
  for (const p of produced) {
    const entry = p.userId ? byUser.get(p.userId) : undefined;
    const key = `${p.orderId}:${p.userId}`;
    if (!entry || !inPeriod(p.at) || seen.has(key)) continue;
    seen.add(key);
    entry.produced++;
  }

  return [...byUser.values()]
    .map((e) => ({
      ...e,
      sales: round2(e.sales),
      avgTicket: e.orders ? round2(e.sales / e.orders) : 0,
      commission: round2((e.sales * (e.commissionRate ?? 0)) / 100),
    }))
    .sort(
      (a, b) =>
        b.sales - a.sales ||
        b.orders - a.orders ||
        b.produced - a.produced ||
        a.name.localeCompare(b.name),
    );
}

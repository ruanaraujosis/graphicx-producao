/**
 * Custo médio ponderado (decisão de negócio da Fase 2).
 * Mesma regra do gatilho `private.apply_stock_movement()` no banco (há teste).
 * Saldo negativo conta como zero: não "devolve" custo de algo que não existia.
 */
export function weightedAverageCost(input: {
  onHand: number;
  avgCost: number;
  entryQuantity: number;
  entryUnitCost: number;
}) {
  const before = Math.max(input.onHand, 0);
  const total = before + input.entryQuantity;
  if (total <= 0) return input.avgCost;
  const value = (before * input.avgCost + input.entryQuantity * input.entryUnitCost) / total;
  return Math.round(value * 10_000) / 10_000;
}

/** Custo de produzir uma unidade da variação pela ficha técnica (com perda). */
export function bomUnitCost(
  items: readonly { quantity: number; wastePct: number; avgCost: number }[],
) {
  const cost = items.reduce(
    (sum, item) => sum + item.quantity * (1 + item.wastePct / 100) * item.avgCost,
    0,
  );
  return Math.round(cost * 100) / 100;
}

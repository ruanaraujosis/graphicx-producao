/**
 * Disponibilidade de uma variação: peças prontas (só "pronta-entrega") + quantas dá
 * para produzir com os insumos disponíveis, pela ficha técnica com perda.
 * Mesma regra da visão `public.variant_availability` no banco.
 */

export type BomLine = {
  /** Quantidade do insumo por unidade da variação. */
  quantity: number;
  wastePct: number;
  /** Saldo disponível do insumo (em estoque − reservado). */
  available: number;
};

/** null = sem ficha técnica (não dá para calcular pelos insumos). */
export function producibleUnits(bom: readonly BomLine[]): number | null {
  if (bom.length === 0) return null;
  return Math.min(
    ...bom.map((line) => {
      const perUnit = line.quantity * (1 + line.wastePct / 100);
      return Math.floor(Math.max(line.available, 0) / perUnit);
    }),
  );
}

export function availableUnits(input: {
  fulfillment: "sob_encomenda" | "pronta_entrega";
  readyAvailable: number;
  bom: readonly BomLine[];
}) {
  const ready = input.fulfillment === "pronta_entrega" ? Math.max(input.readyAvailable, 0) : 0;
  return ready + (producibleUnits(input.bom) ?? 0);
}

/** Quanto consumir de cada insumo para N unidades (o que a baixa por ficha técnica lança). */
export function bomConsumption(units: number, line: Pick<BomLine, "quantity" | "wastePct">) {
  return Math.round(units * line.quantity * (1 + line.wastePct / 100) * 1000) / 1000;
}

/** Sugestão de compra: repor até 2× o estoque mínimo quando abaixo dele. */
export function suggestedPurchase(input: { minStock: number; available: number }) {
  if (input.minStock <= 0 || input.available >= input.minStock) return 0;
  return Math.max(input.minStock * 2 - input.available, 0);
}

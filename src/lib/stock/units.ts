/** Unidades de medida dos insumos (iguais ao check de `materials.unit` no banco). */
export const UNITS = [
  "un",
  "folha",
  "m",
  "m2",
  "cm",
  "kg",
  "g",
  "l",
  "ml",
  "rolo",
  "par",
  "cx",
] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  un: "unidade",
  folha: "folha",
  m: "metro",
  m2: "m²",
  cm: "centímetro",
  kg: "quilo",
  g: "grama",
  l: "litro",
  ml: "mililitro",
  rolo: "rolo",
  par: "par",
  cx: "caixa",
};

export const UNIT_SHORT: Record<Unit, string> = {
  un: "un",
  folha: "fl",
  m: "m",
  m2: "m²",
  cm: "cm",
  kg: "kg",
  g: "g",
  l: "L",
  ml: "mL",
  rolo: "rl",
  par: "par",
  cx: "cx",
};

export const MOVEMENT_TYPES = [
  "entrada",
  "saida",
  "ajuste",
  "perda",
  "consumo",
  "reserva",
  "liberacao",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  entrada: "Entrada (compra)",
  saida: "Saída",
  ajuste: "Ajuste de inventário",
  perda: "Perda",
  consumo: "Consumo na produção",
  reserva: "Reserva",
  liberacao: "Liberação de reserva",
};

/** Efeito da movimentação no saldo físico (o "ajuste" já vem com sinal). */
export function onHandDelta(type: MovementType, quantity: number) {
  switch (type) {
    case "entrada":
    case "ajuste":
      return quantity;
    case "saida":
    case "perda":
    case "consumo":
      return -quantity;
    default:
      return 0;
  }
}

export function formatQuantity(value: number, unit?: Unit) {
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${UNIT_SHORT[unit]}` : formatted;
}

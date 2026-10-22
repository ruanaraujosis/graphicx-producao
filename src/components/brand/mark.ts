/**
 * Geometria do símbolo da GraphicX — "GX" em blocos (grade 93 × 52), usada
 * pelo componente da logo e pelos ícones (favicon/PWA), para saírem iguais.
 * G de cantos chanfrados + o X da marca (ponta separada e cortes retos), cada
 * letra em gradiente do roxo (esquerda) ao azul-marinho (direita).
 */
export const MARK = {
  viewBox: "3 4 93 52",
  width: 93,
  height: 52,
  /** Fundo dos ícones do app e do navegador. */
  background: "#ffffff",
  gradient: { from: "#8b5cf6", to: "#14287a" },
  /** G: traço central (stroke 11, cantos em esquadria). */
  g: "M47 12 H17 L11 18 V42 L17 48 H41 L47 42 V31 H32",
  gStroke: 11,
  /** Faixa horizontal de cada letra, para o gradiente. */
  gRange: [5, 53],
  xRange: [51.5, 93],
  /** X: ponta de cima, perna de baixo e perna principal (já posicionados). */
  x: [
    "M52.4 6.5 H64.62 L71.2 16.84 L65.09 26.24 Z",
    "M66.5 28.12 L77.78 28.12 L92.82 53.5 H79.66 Z",
    "M78.72 6.5 H91.88 L64.62 53.5 H51.46 Z",
  ],
} as const;

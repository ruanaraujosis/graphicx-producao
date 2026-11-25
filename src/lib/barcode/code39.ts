/**
 * Código de barras Code 39 só com números (o número do pedido), em SVG.
 * Cada caractere tem 9 elementos (barra, espaço, barra...), 3 deles largos.
 */
const PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  "*": "nwnnwnwnn",
};

const NARROW = 1;
const WIDE = 3;

/** Larguras (em módulos) de barras e espaços, já com o * de início e fim. */
export function code39Widths(value: string): number[] {
  if (!/^\d{1,20}$/.test(value)) throw new Error("Code 39 aqui aceita só números.");
  const widths: number[] = [];
  const chars = `*${value}*`.split("");
  chars.forEach((c, i) => {
    for (const e of PATTERNS[c]) widths.push(e === "w" ? WIDE : NARROW);
    if (i < chars.length - 1) widths.push(NARROW); // espaço entre caracteres
  });
  return widths;
}

/** SVG do código de barras (preto no branco, com zona de silêncio). */
export function code39Svg(value: string, height = 40) {
  const widths = code39Widths(value);
  const quiet = 10;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
    x += w;
  });
  const total = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" role="img" aria-label="Código de barras ${value}"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`;
}

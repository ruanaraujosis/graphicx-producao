/**
 * Fonte de traços (linhas retas numa grade 4 × 6) para escrever a marca d'água
 * das provas como caminho SVG. Não depende de fontes instaladas no servidor
 * (a Vercel não tem), então o texto sai igual em qualquer lugar.
 */
const GLYPHS: Record<string, string> = {
  P: "M0 6L0 0L3 0L4 1L4 2L3 3L0 3",
  R: "M0 6L0 0L3 0L4 1L4 2L3 3L0 3M2 3L4 6",
  O: "M1 0L3 0L4 1L4 5L3 6L1 6L0 5L0 1Z",
  V: "M0 0L2 6L4 0",
  A: "M0 6L2 0L4 6M0.7 4L3.3 4",
  "#": "M1.5 0L0.5 6M3.5 0L2.5 6M0 2L4 2M0 4L4 4",
  "0": "M1 0L3 0L4 1L4 5L3 6L1 6L0 5L0 1Z",
  "1": "M1 1L2 0L2 6M1 6L3 6",
  "2": "M0 1L1 0L3 0L4 1L4 2L0 6L4 6",
  "3": "M0 0L4 0L2 2.5L3 2.5L4 3.5L4 5L3 6L1 6L0 5",
  "4": "M3 6L3 0L0 4L4 4",
  "5": "M4 0L0 0L0 2.5L3 2.5L4 3.5L4 5L3 6L0 6",
  "6": "M3 0L1 0L0 1L0 5L1 6L3 6L4 5L4 3.5L3 2.5L0 2.5",
  "7": "M0 0L4 0L1.5 6",
  "8": "M1 0L3 0L4 1L4 2L3 3L1 3L0 2L0 1ZM1 3L0 4L0 5L1 6L3 6L4 5L4 4L3 3",
  "9": "M4 3.5L1 3.5L0 2.5L0 1L1 0L3 0L4 1L4 5L3 6L1 6",
};

const ADVANCE = 5.5;

/** Letras que a fonte sabe desenhar (o resto vira espaço). */
export const STROKE_FONT_CHARS = Object.keys(GLYPHS);

/**
 * Caminho SVG do texto com altura `size` (px), começando em (0, 0).
 * Devolve também a largura total para posicionar repetições.
 */
export function strokeTextPath(text: string, size: number) {
  const scale = size / 6;
  const parts: string[] = [];
  let cursor = 0;
  for (const char of text.toUpperCase()) {
    const glyph = GLYPHS[char];
    if (glyph) {
      parts.push(
        glyph.replace(/([ML])([\d.]+) ([\d.]+)/g, (_, cmd: string, x: string, y: string) => {
          const px = (Number(x) + cursor) * scale;
          const py = Number(y) * scale;
          return `${cmd}${round(px)} ${round(py)}`;
        }),
      );
    }
    cursor += ADVANCE;
  }
  return { d: parts.join(""), width: round(Math.max(0, cursor - (ADVANCE - 4)) * scale) };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

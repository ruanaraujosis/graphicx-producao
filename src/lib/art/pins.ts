/** Ponto marcado pelo cliente na prova: posição relativa à imagem (0 a 1) e número. */
export type ProofPin = { x: number; y: number; n: number };

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Lê `art_reviews.pins` (jsonb) com segurança: ignora itens malformados. */
export function parsePins(value: unknown): ProofPin[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (p): p is ProofPin =>
        typeof p === "object" &&
        p !== null &&
        Number.isFinite((p as ProofPin).x) &&
        Number.isFinite((p as ProofPin).y) &&
        Number.isInteger((p as ProofPin).n),
    )
    .map((p) => ({ x: clamp(p.x), y: clamp(p.y), n: p.n }))
    .sort((a, b) => a.n - b.n);
}

/**
 * O link do cliente escreve "1. texto" no comentário a cada ponto marcado. Separa o que foi
 * escrito para cada número; linhas sem número ficam como observação geral.
 */
export function notesByPin(comment: string | null | undefined) {
  const notes = new Map<number, string>();
  const general: string[] = [];
  let current: number | null = null;
  for (const line of (comment ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{1,2})[.)]\s*(.*)$/);
    if (match) {
      current = Number(match[1]);
      notes.set(current, match[2].trim());
    } else if (line.trim()) {
      if (current === null) general.push(line.trim());
      else notes.set(current, `${notes.get(current)} ${line.trim()}`.trim());
    }
  }
  return { notes, general: general.join(" ") };
}

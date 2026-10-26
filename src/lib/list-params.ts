/** Busca + paginação no servidor (parâmetros ?q= e ?pagina=). */
export const PAGE_SIZE = 25;

export function parseListParams(params: Record<string, string | string[] | undefined>) {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(typeof params.pagina === "string" ? params.pagina : 1) || 1);
  const from = (page - 1) * PAGE_SIZE;
  return { q, page, from, to: from + PAGE_SIZE - 1 };
}

/** Escapa curingas do ILIKE para a busca não virar padrão. */
export function ilikeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
}

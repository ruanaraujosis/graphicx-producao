/**
 * Respostas às avaliações por modelos prontos (sem IA por enquanto).
 * Ponto de encaixe para IA no futuro: `suggestReply` é o único lugar que monta o texto.
 */

export type ReplyTemplate = { min_stars: number; max_stars: number; body: string };

/** Modelos padrão do GraphicX (tom amigável), usados quando a gráfica não tem os seus. */
export const DEFAULT_REPLY_TEMPLATES: ReplyTemplate[] = [
  {
    min_stars: 5,
    max_stars: 5,
    body: "Oi, {comprador}! Que alegria saber que você amou {produto} 💜 Muito obrigado pela confiança e volte sempre! — {loja}",
  },
  {
    min_stars: 4,
    max_stars: 4,
    body: "Oi, {comprador}! Obrigado pela avaliação 😊 Ficamos felizes que você gostou de {produto}. Esperamos te ver de novo por aqui! — {loja}",
  },
  {
    min_stars: 3,
    max_stars: 3,
    body: "Oi, {comprador}! Obrigado pelo retorno. Queremos que a sua experiência seja nota 5: chama a gente no chat para contarmos como melhorar. — {loja}",
  },
  {
    min_stars: 1,
    max_stars: 2,
    body: "Oi, {comprador}, sentimos muito pela sua experiência 😔 Queremos resolver: fale com a gente pelo chat da loja que vamos te ajudar. — {loja}",
  },
];

/** A partir de quantas estrelas a resposta pode sair sozinha. */
export const AUTO_REPLY_MIN_STARS = 4;

export const REPLY_FIELDS = [
  { key: "comprador", label: "Nome do comprador" },
  { key: "produto", label: "Produto avaliado" },
  { key: "loja", label: "Nome ou assinatura da loja" },
] as const;

export function fillReply(
  body: string,
  vars: { comprador: string; produto: string; loja: string },
) {
  return body
    .replace(/\{comprador\}/g, vars.comprador || "cliente")
    .replace(/\{produto\}/g, vars.produto || "o produto")
    .replace(/\{loja\}/g, vars.loja)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Sugestão de resposta para a avaliação: um modelo da faixa de estrelas
 * (da gráfica, senão o padrão). `seed` escolhe entre vários modelos da mesma
 * faixa de forma estável (a mesma avaliação recebe sempre o mesmo modelo).
 */
export function suggestReply(input: {
  rating: number;
  templates: ReplyTemplate[];
  vars: { comprador: string; produto: string; loja: string };
  seed: string;
}) {
  const match = (list: ReplyTemplate[]) =>
    list.filter((t) => input.rating >= t.min_stars && input.rating <= t.max_stars);
  const own = match(input.templates);
  const options = own.length ? own : match(DEFAULT_REPLY_TEMPLATES);
  if (!options.length) return "";
  let hash = 0;
  for (const ch of input.seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return fillReply(options[hash % options.length].body, input.vars);
}

/** Primeiro nome do comprador (o usuário da Shopee costuma vir como apelido). */
export function buyerFirstName(username: string | null | undefined) {
  const clean = (username ?? "").replace(/[._\d]+/g, " ").trim();
  const first = clean.split(/\s+/)[0] ?? "";
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

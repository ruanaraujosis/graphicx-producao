import { type CallLog, type ShopCredentials, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

/** A Shopee deixa até 5 anúncios impulsionados ao mesmo tempo, por 4 horas. */
export const MAX_BOOSTED = 5;
/** Tamanho máximo da resposta a uma avaliação. */
export const MAX_REPLY = 500;

// -----------------------------------------------------------------------------
// Impulsionamento
// -----------------------------------------------------------------------------

/** Anúncios ainda impulsionados (em "cool down") — ocupam vagas. */
export async function getBoostedItems(
  config: ShopeeConfig,
  shop: ShopCredentials,
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: { item_list?: { item_id: number; cool_down_second?: number }[] };
  }>({ config, path: "/api/v2/product/get_boosted_list", shop, ...opts });
  return (r.response?.item_list ?? [])
    .filter((i) => (i.cool_down_second ?? 0) > 0)
    .map((i) => String(i.item_id));
}

/** Impulsiona os anúncios; devolve os recusados com o motivo. */
export async function boostItems(
  config: ShopeeConfig,
  shop: ShopCredentials,
  itemIds: string[],
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: { failure_list?: { item_id?: number; failed_reason?: string }[] };
  }>({
    config,
    path: "/api/v2/product/boost_item",
    method: "POST",
    shop,
    body: { item_id_list: itemIds.slice(0, MAX_BOOSTED).map(Number) },
    ...opts,
  });
  return new Map(
    (r.response?.failure_list ?? []).map((f) => [
      String(f.item_id ?? ""),
      f.failed_reason ?? "Recusado.",
    ]),
  );
}

export type BoostCandidate = {
  external_item_id: string;
  position: number;
  active: boolean;
  last_boosted_at: string | null;
  /** Estoque na Shopee (nulo = desconhecido, conta como disponível). */
  stock: number | null;
};

/**
 * Escolhe quem impulsionar agora: ativos, com estoque, fora dos que já estão
 * impulsionados, nas vagas livres. Rodízio pela lista de prioridade: quem foi
 * impulsionado há mais tempo (ou nunca) vem primeiro; empate = ordem da lista.
 */
export function pickBoostItems(candidates: BoostCandidate[], boostedNow: string[]) {
  const slots = Math.max(0, MAX_BOOSTED - boostedNow.length);
  const busy = new Set(boostedNow);
  return candidates
    .filter((c) => c.active && c.stock !== 0 && !busy.has(c.external_item_id))
    .sort((a, b) => {
      const ta = a.last_boosted_at ? new Date(a.last_boosted_at).getTime() : 0;
      const tb = b.last_boosted_at ? new Date(b.last_boosted_at).getTime() : 0;
      return ta - tb || a.position - b.position;
    })
    .slice(0, slots)
    .map((c) => c.external_item_id);
}

// -----------------------------------------------------------------------------
// Avaliações
// -----------------------------------------------------------------------------
export type ShopeeComment = {
  comment_id: number;
  comment?: string;
  buyer_username?: string;
  item_id?: number;
  rating_star?: number;
  create_time?: number;
  comment_reply?: { reply?: string };
};

/** Avaliações mais recentes da loja (até `maxPages` páginas de 100). */
export async function getComments(
  config: ShopeeConfig,
  shop: ShopCredentials,
  opts: Opts & { maxPages?: number } = {},
) {
  const out: ShopeeComment[] = [];
  let cursor = "";
  for (let page = 0; page < (opts.maxPages ?? 5); page++) {
    const r = await shopeeRequest<{
      response?: { item_comment_list?: ShopeeComment[]; more?: boolean; next_cursor?: string };
    }>({
      config,
      path: "/api/v2/product/get_comment",
      shop,
      query: { cursor, page_size: 100 },
      ...opts,
    });
    out.push(...(r.response?.item_comment_list ?? []));
    if (!r.response?.more || !r.response.next_cursor) break;
    cursor = r.response.next_cursor;
  }
  return out;
}

/** Responde avaliações; devolve as que falharam com o motivo. */
export async function replyComments(
  config: ShopeeConfig,
  shop: ShopCredentials,
  list: { commentId: string; text: string }[],
  opts: Opts = {},
) {
  const r = await shopeeRequest<{
    response?: {
      result_list?: { comment_id?: number; fail_error?: string; fail_message?: string }[];
    };
  }>({
    config,
    path: "/api/v2/product/reply_comment",
    method: "POST",
    shop,
    body: {
      comment_list: list.map((c) => ({
        comment_id: Number(c.commentId),
        comment: c.text.slice(0, MAX_REPLY),
      })),
    },
    ...opts,
  });
  return new Map(
    (r.response?.result_list ?? [])
      .filter((x) => x.fail_error)
      .map((x) => [String(x.comment_id ?? ""), x.fail_message || x.fail_error || "Recusada."]),
  );
}

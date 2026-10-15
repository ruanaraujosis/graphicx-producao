import { type CallLog, type ShopCredentials, ShopeeError, shopeeRequest } from "./client";
import type { ShopeeConfig } from "./config";

type Opts = { onLog?: (l: CallLog) => void; fetchImpl?: typeof fetch; now?: () => number };

/** Mensagem padrão (a loja pode trocar em Ajustes). */
export const DEFAULT_CHAT_TEMPLATE =
  "Olá! Obrigado pela compra na {loja}. Envie a arte do seu pedido {pedido} por este link: {link}";

/** Limite de texto de uma mensagem no chat da Shopee. */
export const MAX_CHAT_TEXT = 1000;

/** Monta a mensagem a partir do modelo da loja ({loja}, {pedido}, {link}). */
export function chatMessage(
  template: string,
  vars: { loja: string; pedido: string; link: string },
) {
  return template
    .replace(/\{loja\}/g, vars.loja)
    .replace(/\{pedido\}/g, vars.pedido)
    .replace(/\{link\}/g, vars.link)
    .trim()
    .slice(0, MAX_CHAT_TEXT);
}

/** Chat não liberado para o app/conta: repetir não resolve. */
export function isChatNotAllowed(e: unknown) {
  return (
    e instanceof ShopeeError &&
    /permission|no_access|not_allow|forbidden|access_denied/i.test(`${e.code} ${e.message}`)
  );
}

/** Envia texto ao comprador pelo chat da loja (Seller Chat). */
export async function sendChatText(
  config: ShopeeConfig,
  shop: ShopCredentials,
  toId: string,
  text: string,
  opts: Opts = {},
) {
  await shopeeRequest({
    config,
    path: "/api/v2/sellerchat/send_message",
    method: "POST",
    shop,
    body: { to_id: Number(toId), message_type: "text", content: { text } },
    ...opts,
  });
}

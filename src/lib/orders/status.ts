import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Status do pedido, na mesma ordem do enum `public.order_status` (há teste).
 * A ordem importa: o banco compara status com < e >.
 */
export const ORDER_STATUSES = [
  "orcamento",
  "novo",
  "aguardando_arte",
  "arte_em_criacao",
  "aguardando_aprovacao",
  "aprovado",
  "em_impressao",
  "acabamento",
  "expedicao",
  "enviado",
  "entregue",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  orcamento: "Orçamento",
  novo: "Novo",
  aguardando_arte: "Aguardando Arte",
  arte_em_criacao: "Arte em Criação",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovado: "Aprovado",
  em_impressao: "Em Impressão",
  acabamento: "Acabamento",
  expedicao: "Expedição",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export type StatusTone = "muted" | "info" | "warning" | "primary" | "teal" | "success" | "danger";

export const STATUS_TONES: Record<OrderStatus, StatusTone> = {
  orcamento: "muted",
  novo: "info",
  aguardando_arte: "warning",
  arte_em_criacao: "primary",
  aguardando_aprovacao: "warning",
  aprovado: "teal",
  em_impressao: "primary",
  acabamento: "primary",
  expedicao: "info",
  enviado: "success",
  entregue: "success",
  cancelado: "danger",
};

/** Colunas do quadro de produção (orçamentos e cancelados ficam fora). */
export const BOARD_STATUSES = ORDER_STATUSES.filter(
  (s) => s !== "orcamento" && s !== "cancelado",
) as Exclude<OrderStatus, "orcamento" | "cancelado">[];

/** Etapas em que o pedido ainda está "aberto" (conta prazo). */
export function isOpen(status: OrderStatus) {
  return (
    status !== "orcamento" &&
    status !== "enviado" &&
    status !== "entregue" &&
    status !== "cancelado"
  );
}

const index = (s: OrderStatus) => ORDER_STATUSES.indexOf(s);

/** O status vem antes de outro na sequência (mesma comparação do banco). */
export function isBefore(a: OrderStatus, b: OrderStatus) {
  return index(a) < index(b);
}
const between = (s: OrderStatus, a: OrderStatus, b: OrderStatus) =>
  index(s) >= index(a) && index(s) <= index(b);

/**
 * Quem pode mover o pedido de um status para outro.
 * Mesma regra de `private.can_set_order_status` (há teste).
 */
export function canSetStatus(
  permissions: readonly Permission[],
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  if (from === to) return false;
  if (can(permissions, "pedidos.gerenciar")) return true;
  const restricted = (s: OrderStatus) => s === "orcamento" || s === "cancelado";
  if (restricted(from) || restricted(to)) return false;
  return (
    (can(permissions, "artes.gerenciar") &&
      between(from, "novo", "aprovado") &&
      between(to, "novo", "aprovado")) ||
    (can(permissions, "pcp.gerenciar") &&
      between(from, "novo", "expedicao") &&
      between(to, "novo", "expedicao")) ||
    (can(permissions, "expedicao.gerenciar") &&
      between(from, "expedicao", "entregue") &&
      between(to, "expedicao", "entregue"))
  );
}

/** Próxima etapa natural (botão "avançar" no celular). */
export function nextStatus(status: OrderStatus, needsArt: boolean): OrderStatus | null {
  switch (status) {
    case "orcamento":
      return needsArt ? "aguardando_arte" : "novo";
    case "novo":
      return needsArt ? "aguardando_arte" : "em_impressao";
    case "aguardando_arte":
      return "arte_em_criacao";
    case "arte_em_criacao":
      return "aguardando_aprovacao";
    case "aguardando_aprovacao":
      return "aprovado";
    case "aprovado":
      return "em_impressao";
    case "em_impressao":
      return "acabamento";
    case "acabamento":
      return "expedicao";
    case "expedicao":
      return "enviado";
    case "enviado":
      return "entregue";
    default:
      return null;
  }
}

export type ItemStockState = "livre" | "reservado" | "baixado";

/**
 * Estado de estoque que um item deve ter para o status do pedido.
 * Mesma regra de `private.order_item_target_state` (há teste).
 */
export function itemTargetState(
  status: OrderStatus,
  fulfillment: "sob_encomenda" | "pronta_entrega",
): ItemStockState {
  if (status === "orcamento" || status === "cancelado") return "livre";
  if (index(status) < index("em_impressao")) return "reservado";
  if (fulfillment === "pronta_entrega" && index(status) < index("enviado")) return "reservado";
  return "baixado";
}

export const STOCK_STATE_LABELS: Record<ItemStockState, string> = {
  livre: "Sem reserva",
  reservado: "Reservado",
  baixado: "Baixado",
};

export function orderNumber(n: number) {
  return `#${n}`;
}

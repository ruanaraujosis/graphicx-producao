import { CHANNEL_LABELS, type SalesChannel } from "@/lib/catalog/pricing";
import { formatCep, formatDocument, formatPhone } from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import { orderNumber } from "@/lib/orders/status";
import type { LabelData } from "./template";

type Address = {
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
};

/** Endereço em linhas, como vai no envelope. */
export function addressLines(a: Address | null | undefined) {
  if (!a) return "";
  const first = [[a.street, a.number].filter(Boolean).join(", "), a.complement]
    .filter(Boolean)
    .join(" – ");
  const city = [a.city, a.state].filter(Boolean).join("/");
  return [first, a.district, city, a.cep ? `CEP ${formatCep(a.cep)}` : null]
    .filter(Boolean)
    .join("\n");
}

/** "2026-10-20" → "20/10/2026" (data sem fuso). */
const dateBr = (d: string) => d.split("-").reverse().join("/");

export function labelData(input: {
  order: {
    number: number;
    channel: SalesChannel;
    customer_name: string;
    customer_phone: string | null;
    due_date: string | null;
    ship_by_at: string | null;
    external_id: string | null;
    tracking_code: string | null;
    notes: string | null;
    items: { description: string; quantity: number }[];
  };
  customer:
    | (Address & {
        name: string;
        legal_name: string | null;
        document: string | null;
        phone: string | null;
        whatsapp: string | null;
      })
    | null;
  org: Address & {
    name: string;
    legal_name: string | null;
    document: string | null;
    phone: string | null;
  };
}): LabelData {
  const { order: o, customer: c, org } = input;
  const qty = o.items.reduce((s, i) => s + Number(i.quantity), 0);
  return {
    "pedido.numero": orderNumber(o.number),
    "pedido.canal": CHANNEL_LABELS[o.channel],
    "pedido.prazo": o.ship_by_at
      ? formatDateTime(o.ship_by_at)
      : o.due_date
        ? dateBr(o.due_date)
        : "",
    "pedido.itens": o.items
      .map((i) => `${Number(i.quantity).toLocaleString("pt-BR")} × ${i.description}`)
      .join("\n"),
    "pedido.qtd_itens": qty.toLocaleString("pt-BR"),
    "pedido.rastreio": o.tracking_code ?? "",
    "pedido.marketplace": o.external_id ?? "",
    "pedido.observacoes": o.notes ?? "",
    "cliente.nome": c?.legal_name || c?.name || o.customer_name,
    "cliente.endereco": addressLines(c),
    "cliente.telefone": formatPhone(c?.whatsapp ?? c?.phone ?? o.customer_phone ?? ""),
    "cliente.documento": c?.document ? formatDocument(c.document) : "",
    "grafica.nome": org.legal_name || org.name,
    "grafica.endereco": addressLines(org),
    "grafica.telefone": formatPhone(org.phone ?? ""),
    "grafica.cnpj": org.document ? formatDocument(org.document) : "",
  };
}

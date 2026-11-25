import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireOrg } from "@/lib/auth/dal";
import { code39Svg } from "@/lib/barcode/code39";
import { formatAddress } from "@/lib/address";
import { formatDocument, formatPhone } from "@/lib/documents";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

export const metadata = { title: "Pedido de venda" };

const UUID = /^[0-9a-f-]{36}$/i;
const CHANNEL_LABELS: Record<string, string> = {
  balcao: "Balcão",
  whatsapp: "WhatsApp",
  shopee: "Shopee",
};

/** Documento do pedido de venda para conferir e assinar. Não é nota fiscal. */
export default function PedidoVendaPrintPage({ params }: PageProps<"/imprimir/vendas/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparando…</p>}>
      <Documento params={params} />
    </Suspense>
  );
}

async function Documento({ params }: { params: PageProps<"/imprimir/vendas/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { membership } = await requireOrg(["vendas.ver", "pedidos.ver"]);
  const org = membership.organizationId;
  const supabase = await createClient();

  const [orderRes, orgRes, settingsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, number, status, channel, kind, customer_name, customer_phone, seller_id, subtotal, discount, discount_percent, shipping, total, notes, cancel_reason, sold_at, created_at, payment_methods(name), receivables(status, due_date), customers(name, legal_name, document, phone, whatsapp, email, cep, street, number, complement, district, city, state), order_items(id, description, complement, quantity, unit_price, position, product_variants(sku, product_id))",
      )
      .eq("organization_id", org)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select(
        "name, legal_name, document, phone, cep, street, number, complement, district, city, state",
      )
      .eq("id", org)
      .single(),
    supabase.from("sales_settings").select("*").eq("organization_id", org).maybeSingle(),
  ]);
  const order = orderRes.data;
  const grafica = orgRes.data;
  if (!order || !grafica || order.kind !== "venda") notFound();
  const settings = settingsRes.data;

  const sortBy = settings?.print_item_order ?? "inclusao";
  const items = [...order.order_items].sort((a, b) => {
    if (sortBy === "sku")
      return (a.product_variants?.sku ?? "").localeCompare(b.product_variants?.sku ?? "", "pt-BR");
    if (sortBy === "descricao") return a.description.localeCompare(b.description, "pt-BR");
    return a.position - b.position;
  });

  // Foto principal de cada produto (opcional, configurada pela gráfica).
  const images = new Map<string, string>();
  if (settings?.print_product_images) {
    const productIds = [
      ...new Set(items.map((i) => i.product_variants?.product_id).filter(Boolean)),
    ] as string[];
    if (productIds.length) {
      const { data: photos } = await supabase
        .from("product_images")
        .select("product_id, storage_path, position")
        .in("product_id", productIds)
        .order("position");
      const first = new Map<string, string>();
      for (const p of photos ?? [])
        if (!first.has(p.product_id)) first.set(p.product_id, p.storage_path);
      if (first.size) {
        const { data: signed } = await supabase.storage
          .from("produtos")
          .createSignedUrls([...first.values()], 60 * 60);
        const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
        for (const [productId, path] of first) {
          const url = byPath.get(path);
          if (url) images.set(productId, url);
        }
      }
    }
  }

  let sellerName = "—";
  if (order.seller_id) {
    const { data: seller } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", order.seller_id)
      .maybeSingle();
    sellerName = seller?.full_name ?? "—";
  }

  const code =
    settings?.print_code === "barras"
      ? code39Svg(String(order.number))
      : await orderQrSvg(order.id);
  const customer = order.customers;
  const receivable = Array.isArray(order.receivables) ? order.receivables[0] : order.receivables;
  const paid = receivable?.status === "recebido";
  const cancelled = order.status === "cancelado";
  const when = order.sold_at ?? order.created_at;
  const showImages = images.size > 0;

  return (
    <div className="min-h-screen bg-muted/40 print:bg-white">
      <PrintButton summary={`Pedido de venda ${orderNumber(order.number)}`} />
      <article className="relative mx-auto my-6 w-full max-w-[210mm] bg-white p-[12mm] text-[11pt] leading-snug text-black shadow-sm print:my-0 print:p-[8mm] print:shadow-none">
        {cancelled && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-0 flex -rotate-12 items-center justify-center text-7xl font-black tracking-widest text-black/10"
          >
            CANCELADA
          </p>
        )}

        <header className="flex items-start justify-between gap-6 border-b border-black pb-4">
          <div className="min-w-0">
            <p className="text-xl font-bold">{grafica.name}</p>
            {grafica.legal_name && <p>{grafica.legal_name}</p>}
            {grafica.document && <p>CNPJ/CPF {formatDocument(grafica.document)}</p>}
            {formatAddress(grafica) && <p>{formatAddress(grafica)}</p>}
            {grafica.phone && <p>Telefone {formatPhone(grafica.phone)}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-right">
            <p className="text-lg font-bold">Pedido de venda {orderNumber(order.number)}</p>
            <p>{formatDateTime(when)}</p>
            <div
              className={settings?.print_code === "barras" ? "h-12 w-48" : "size-24"}
              // SVG gerado no servidor a partir do número/id do pedido (sem dado do usuário).
              dangerouslySetInnerHTML={{ __html: code }}
            />
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-black py-3">
          <p className="col-span-2 font-semibold">Cliente</p>
          <p>
            <span className="font-medium">Nome:</span> {customer?.name ?? order.customer_name}
          </p>
          <p>
            <span className="font-medium">CPF/CNPJ:</span>{" "}
            {customer?.document ? formatDocument(customer.document) : "—"}
          </p>
          <p>
            <span className="font-medium">Telefone:</span>{" "}
            {formatPhone(customer?.whatsapp ?? customer?.phone ?? order.customer_phone) || "—"}
          </p>
          <p>
            <span className="font-medium">E-mail:</span> {customer?.email ?? "—"}
          </p>
          <p className="col-span-2">
            <span className="font-medium">Endereço:</span>{" "}
            {customer ? formatAddress(customer) || "—" : "—"}
          </p>
        </section>

        <section className="grid grid-cols-3 gap-x-6 border-b border-black py-3">
          <p>
            <span className="font-medium">Vendedor:</span> {sellerName}
          </p>
          <p>
            <span className="font-medium">Canal:</span>{" "}
            {CHANNEL_LABELS[order.channel] ?? order.channel}
          </p>
          <p>
            <span className="font-medium">Pagamento:</span> {order.payment_methods?.name ?? "—"}
            {receivable
              ? paid
                ? " · pago"
                : ` · a receber até ${formatDate(`${receivable.due_date}T12:00:00`)}`
              : ""}
          </p>
        </section>

        <table className="mt-3 w-full border-collapse text-[10pt]">
          <thead>
            <tr className="border-b border-black text-left">
              {showImages && <th className="w-14 py-1" />}
              <th className="py-1 pr-2">SKU</th>
              <th className="py-1 pr-2">Descrição</th>
              <th className="py-1 pr-2 text-right">Qtd.</th>
              <th className="py-1 pr-2 text-right">Unitário</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const img = i.product_variants?.product_id
                ? images.get(i.product_variants.product_id)
                : undefined;
              return (
                <tr key={i.id} className="border-b border-black/30 align-top">
                  {showImages && (
                    <td className="py-1">
                      {img && (
                        // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária, só para impressão.
                        <img src={img} alt="" className="size-12 object-cover" />
                      )}
                    </td>
                  )}
                  <td className="py-1 pr-2 whitespace-nowrap">{i.product_variants?.sku ?? "—"}</td>
                  <td className="py-1 pr-2">
                    {i.description}
                    {i.complement && <span className="block text-[9pt]">{i.complement}</span>}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {i.quantity.toLocaleString("pt-BR")}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatCurrency(i.unit_price)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrency(Math.round(i.quantity * i.unit_price * 100) / 100)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="mt-3 ml-auto w-64 text-[10pt]">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatCurrency(order.subtotal)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <dt>Desconto ({order.discount_percent.toLocaleString("pt-BR")}%)</dt>
              <dd className="tabular-nums">− {formatCurrency(order.discount)}</dd>
            </div>
          )}
          {order.shipping > 0 && (
            <div className="flex justify-between">
              <dt>Frete</dt>
              <dd className="tabular-nums">{formatCurrency(order.shipping)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-black pt-1 text-[12pt] font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(order.total)}</dd>
          </div>
        </dl>

        {order.notes && (
          <section className="mt-4">
            <p className="font-semibold">Observações</p>
            <p className="whitespace-pre-line">{order.notes}</p>
          </section>
        )}
        {cancelled && order.cancel_reason && (
          <p className="mt-2 font-semibold">Venda cancelada: {order.cancel_reason}</p>
        )}

        <section className="mt-14 grid grid-cols-2 gap-10 text-center text-[10pt]">
          <div>
            <div className="border-t border-black pt-1">
              {customer?.name ?? order.customer_name}
            </div>
            <p>Cliente</p>
          </div>
          <div>
            <div className="border-t border-black pt-1">{grafica.name}</div>
            <p>Gráfica</p>
          </div>
        </section>
        <p className="mt-6 text-center text-[10pt]">Data: ____ / ____ / ________</p>

        <footer className="mt-8 border-t border-black pt-2 text-center text-[9pt]">
          Documento para conferência e assinatura. Não é nota fiscal e não tem valor fiscal.
        </footer>
      </article>
    </div>
  );
}

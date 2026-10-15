import { notFound } from "next/navigation";
import { Suspense } from "react";
import { type Address, formatAddress, isShippable } from "@/lib/address";
import { requireOrg } from "@/lib/auth/dal";
import { formatPhone } from "@/lib/documents";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { PrintToolbar } from "../print-toolbar";

export const metadata = { title: "Etiquetas de envio" };

const MAX = 100;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Etiqueta de envio dos pedidos de balcão e WhatsApp: destinatário (endereço do
 * cliente), remetente (endereço da gráfica), número do pedido e QR Code.
 * Pedidos da Shopee usam a etiqueta oficial da Shopee.
 */
export default function EnvioPage({ searchParams }: PageProps<"/imprimir/envio">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Preparando…</p>}>
      <Envio searchParams={searchParams} />
    </Suspense>
  );
}

function AddressBlock({
  title,
  name,
  address,
  phone,
  big,
}: {
  title: string;
  name: string;
  address: Partial<Address>;
  phone: string | null;
  big?: boolean;
}) {
  const line = formatAddress(address);
  return (
    <section className="flex flex-col gap-[1mm] rounded-[1mm] border border-black p-[3mm]">
      <p className="text-[8pt] font-semibold tracking-wide uppercase">{title}</p>
      <p className={big ? "text-[14pt] leading-tight font-bold" : "text-[10pt] font-semibold"}>
        {name}
      </p>
      <p className={big ? "text-[11pt] leading-snug" : "text-[9pt] leading-snug"}>
        {line || "Endereço não informado"}
      </p>
      {phone && <p className={big ? "text-[10pt]" : "text-[8pt]"}>Tel. {formatPhone(phone)}</p>}
    </section>
  );
}

async function Envio({
  searchParams,
}: {
  searchParams: PageProps<"/imprimir/envio">["searchParams"];
}) {
  const raw = await searchParams;
  const ids = (typeof raw.ids === "string" ? raw.ids.split(",") : [])
    .filter((id) => UUID.test(id))
    .slice(0, MAX);
  if (!ids.length) notFound();
  const format = raw.formato === "a4" ? "a4" : "etiqueta";

  const { membership } = await requireOrg(["pedidos.ver", "expedicao.ver"]);
  const supabase = await createClient();
  const [{ data }, { data: org }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, number, channel, customer_name, customer_phone, order_items(quantity), customers(name, legal_name, phone, whatsapp, cep, street, number, complement, district, city, state)",
      )
      .eq("organization_id", membership.organizationId)
      .neq("channel", "shopee")
      .in("id", ids),
    supabase
      .from("organizations")
      .select("name, legal_name, phone, cep, street, number, complement, district, city, state")
      .eq("id", membership.organizationId)
      .single(),
  ]);
  const byId = new Map((data ?? []).map((o) => [o.id, o]));
  const orders = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  if (!orders.length || !org) notFound();
  const qrs = await Promise.all(orders.map((o) => orderQrSvg(o.id)));

  const warnings: string[] = [];
  if (!isShippable(org))
    warnings.push(
      "O endereço da gráfica (remetente) está incompleto: preencha em Configurações → Dados da gráfica.",
    );
  for (const o of orders) {
    if (!o.customers)
      warnings.push(`Pedido ${orderNumber(o.number)}: sem cliente cadastrado, sem endereço.`);
    else if (!isShippable(o.customers))
      warnings.push(`Pedido ${orderNumber(o.number)}: endereço do cliente incompleto.`);
  }

  return (
    <div className="min-h-dvh bg-muted print:bg-white">
      <style>{`
        @page { size: ${format === "a4" ? "A4" : "100mm 150mm"}; margin: ${format === "a4" ? "8mm" : "0"}; }
        @media print { html, body { background: #fff !important; } }
      `}</style>
      <PrintToolbar
        basePath="/imprimir/envio"
        ids={ids.join(",")}
        format={format}
        formats={[
          ["etiqueta", "Etiqueta 10×15 cm"],
          ["a4", "Folha A4 (4 por folha)"],
        ]}
        summary={`${orders.length} ${orders.length === 1 ? "etiqueta" : "etiquetas"} de envio`}
        warnings={warnings}
      />
      <main
        className={
          format === "a4"
            ? "mx-auto grid w-[194mm] grid-cols-2 gap-[4mm] py-6 print:py-0"
            : "mx-auto flex w-[100mm] flex-col gap-6 py-6 print:gap-0 print:py-0"
        }
      >
        {orders.map((o, i) => {
          const c = o.customers;
          const volumes = o.order_items.reduce((s, it) => s + Number(it.quantity), 0);
          return (
            <article
              key={o.id}
              className={
                format === "a4"
                  ? "flex h-[136mm] break-inside-avoid flex-col gap-[3mm] overflow-hidden border border-black bg-white p-[5mm] text-black"
                  : "flex h-[150mm] break-after-page flex-col gap-[3mm] overflow-hidden bg-white p-[6mm] text-black shadow print:shadow-none"
              }
            >
              <AddressBlock
                title="Destinatário"
                name={c?.legal_name || c?.name || o.customer_name}
                address={c ?? {}}
                phone={c?.whatsapp ?? c?.phone ?? o.customer_phone}
                big
              />
              <AddressBlock
                title="Remetente"
                name={org.legal_name || org.name}
                address={org}
                phone={org.phone}
              />
              <div className="mt-auto flex items-end justify-between gap-[3mm]">
                <div>
                  <p className="text-[26pt] leading-none font-bold">{orderNumber(o.number)}</p>
                  <p className="mt-[1mm] text-[9pt]">
                    {volumes.toLocaleString("pt-BR")} {volumes === 1 ? "item" : "itens"}
                  </p>
                </div>
                <div
                  aria-label={`QR Code do pedido ${orderNumber(o.number)}`}
                  role="img"
                  className="size-[28mm] shrink-0"
                  // SVG gerado no servidor pela biblioteca de QR Code (sem conteúdo do usuário).
                  dangerouslySetInnerHTML={{ __html: qrs[i] }}
                />
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}

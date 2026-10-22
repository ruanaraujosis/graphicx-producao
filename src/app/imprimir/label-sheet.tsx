import { notFound } from "next/navigation";
import { LabelView } from "@/components/labels/label-view";
import { requireOrg } from "@/lib/auth/dal";
import { labelData } from "@/lib/labels/data";
import { resolveTemplate, templateImageUrls } from "@/lib/labels/load";
import { KIND_LABELS, type LabelKind } from "@/lib/labels/template";
import { isShippable } from "@/lib/address";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { PrintToolbar } from "./print-toolbar";

const MAX = 100;
const UUID = /^[0-9a-f-]{36}$/i;
/** Área útil da folha A4 com margem de 8 mm. */
const A4 = { w: 194, h: 281 };

/**
 * Folha de etiquetas (envio ou identificação) com o modelo da gráfica.
 * formato=pagina: uma etiqueta por página do tamanho do modelo; a4: várias por folha.
 */
export async function LabelSheet({
  kind,
  basePath,
  searchParams,
}: {
  kind: LabelKind;
  basePath: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const ids = (typeof raw.ids === "string" ? raw.ids.split(",") : [])
    .filter((id) => UUID.test(id))
    .slice(0, MAX);
  if (!ids.length) notFound();
  const format = raw.formato === "a4" ? "a4" : "pagina";
  const modelo =
    raw.modelo === "graphicx" || (typeof raw.modelo === "string" && UUID.test(raw.modelo))
      ? raw.modelo
      : null;

  const { membership } = await requireOrg(["pedidos.ver", "expedicao.ver"]);
  const org = membership.organizationId;
  const supabase = await createClient();
  const [{ data }, { data: grafica }, { template, list }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, number, channel, customer_name, customer_phone, due_date, ship_by_at, external_id, tracking_code, notes, order_items(description, quantity, position), customers(name, legal_name, document, phone, whatsapp, cep, street, number, complement, district, city, state)",
      )
      .eq("organization_id", org)
      .in("id", ids),
    supabase
      .from("organizations")
      .select(
        "name, legal_name, document, phone, cep, street, number, complement, district, city, state",
      )
      .eq("id", org)
      .single(),
    resolveTemplate(supabase, org, kind, modelo),
  ]);
  const byId = new Map((data ?? []).map((o) => [o.id, o]));
  const orders = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  if (!orders.length || !grafica) notFound();
  const [qrs, urls] = await Promise.all([
    Promise.all(orders.map((o) => orderQrSvg(o.id))),
    templateImageUrls(supabase, template),
  ]);

  const warnings: string[] = [];
  if (kind === "envio") {
    if (!isShippable(grafica))
      warnings.push(
        "O endereço da gráfica (remetente) está incompleto: preencha em Configurações → Dados da gráfica.",
      );
    for (const o of orders) {
      if (!o.customers)
        warnings.push(`Pedido ${orderNumber(o.number)}: sem cliente cadastrado, sem endereço.`);
      else if (!isShippable(o.customers))
        warnings.push(`Pedido ${orderNumber(o.number)}: endereço do cliente incompleto.`);
    }
  }

  const w = template.width_mm;
  const h = template.height_mm;
  const cols = Math.max(1, Math.floor((A4.w + 4) / (w + 4)));
  const perSheet = cols * Math.max(1, Math.floor((A4.h + 4) / (h + 4)));

  return (
    <div className="min-h-dvh bg-muted print:bg-white">
      <style>{`
        @page { size: ${format === "a4" ? "A4" : `${w}mm ${h}mm`}; margin: ${format === "a4" ? "8mm" : "0"}; }
        @media print { html, body { background: #fff !important; } }
      `}</style>
      <PrintToolbar
        basePath={basePath}
        ids={ids.join(",")}
        format={format}
        formats={[
          ["pagina", `Uma por página (${w}×${h} mm)`],
          ["a4", `Folha A4 (${perSheet} por folha)`],
        ]}
        templates={[
          { id: "graphicx", name: "Modelo GraphicX" },
          ...list.map((t) => ({
            id: t.id ?? "graphicx",
            name: t.is_default ? `${t.name} (padrão)` : t.name,
          })),
        ]}
        templateId={template.id ?? "graphicx"}
        summary={`${orders.length} × ${KIND_LABELS[kind].toLowerCase()}`}
        warnings={warnings}
      />
      <main
        className={
          format === "a4"
            ? "mx-auto grid justify-center gap-[4mm] py-6 print:py-0"
            : "mx-auto flex w-max flex-col gap-6 py-6 print:gap-0 print:py-0"
        }
        style={format === "a4" ? { gridTemplateColumns: `repeat(${cols}, ${w}mm)` } : undefined}
      >
        {orders.map((o, i) => (
          <LabelView
            key={o.id}
            width={w}
            height={h}
            elements={template.elements}
            backgroundUrl={template.background_path ? urls[template.background_path] : null}
            imageUrls={urls}
            qrSvg={qrs[i]}
            data={labelData({
              order: {
                ...o,
                items: [...o.order_items].sort((a, b) => a.position - b.position),
              },
              customer: o.customers,
              org: grafica,
            })}
            className={
              format === "a4"
                ? "break-inside-avoid outline outline-1 outline-black/20 print:outline-black/40"
                : "break-after-page shadow print:shadow-none"
            }
          />
        ))}
      </main>
    </div>
  );
}

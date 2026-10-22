import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { requireOrg } from "@/lib/auth/dal";
import { parseMonth } from "@/lib/finance/period";
import { formatCurrency, formatPercent } from "@/lib/format";
import { todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { ExportLinks } from "../export-links";
import { MonthNav } from "../month-nav";

export const metadata = { title: "Margem por produto" };

type Params = PageProps<"/financeiro/margem">["searchParams"];

export default function MargemPage({ searchParams }: PageProps<"/financeiro/margem">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Margem searchParams={searchParams} />
    </Suspense>
  );
}

const pct = (margin: number, revenue: number) =>
  revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null;

async function Margem({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const raw = await searchParams;
  const period = parseMonth(raw.mes, todayIso());
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_product_margin", {
    p_org: membership.organizationId,
    p_from: period.from,
    p_to: period.to,
  });
  const rows = data ?? [];
  const totals = rows.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, margin: t.margin + r.margin }),
    { revenue: 0, margin: 0 },
  );
  const totalPct = pct(totals.margin, totals.revenue);

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <MonthNav basePath="/financeiro/margem" {...period} />
        <ExportLinks report="margem" params={{ mes: period.month }} />
      </div>
      <p className="text-sm text-muted-foreground">
        Margem = vendas − custo dos insumos (real, das baixas; ou estimado pela ficha técnica se
        ainda não produziu) − taxa do pagamento, proporcional. Total do mês:{" "}
        <strong className="text-foreground">{formatCurrency(totals.margin)}</strong>
        {totalPct !== null && ` (${formatPercent(totalPct)})`}.
      </p>

      <DataList
        rows={rows}
        rowKey={(r) => r.variant_id}
        empty="Nenhum produto vendido neste mês."
        card={{
          title: (r) => `${r.product_name} — ${r.variant_name}`,
          subtitle: (r) =>
            `${r.sku} · ${r.quantity.toLocaleString("pt-BR")} un · vendas ${formatCurrency(r.revenue)}`,
          extra: (r) => {
            const p = pct(r.margin, r.revenue);
            return (
              <>
                <Pill
                  tone={r.margin >= 0 ? "success" : "danger"}
                >{`Margem ${formatCurrency(r.margin)}`}</Pill>
                {p !== null && <Pill>{formatPercent(p)}</Pill>}
              </>
            );
          },
        }}
        columns={[
          {
            header: "Produto",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.product_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.variant_name} · {r.sku}
                </p>
              </div>
            ),
          },
          { header: "Qtd", cell: (r) => r.quantity.toLocaleString("pt-BR") },
          { header: "Vendas", cell: (r) => formatCurrency(r.revenue) },
          { header: "Insumos", cell: (r) => formatCurrency(r.material_cost) },
          { header: "Taxas", cell: (r) => formatCurrency(r.fees) },
          {
            header: "Margem",
            cell: (r) => (
              <span
                className={
                  r.margin >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"
                }
              >
                {formatCurrency(r.margin)}
              </span>
            ),
          },
          {
            header: "%",
            cell: (r) => {
              const p = pct(r.margin, r.revenue);
              return p === null ? "—" : formatPercent(p);
            },
          },
        ]}
      />
    </>
  );
}

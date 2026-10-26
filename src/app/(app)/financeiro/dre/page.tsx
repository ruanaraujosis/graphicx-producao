import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { requireOrg } from "@/lib/auth/dal";
import { lastMonths, parseMonth } from "@/lib/finance/period";
import { formatCurrency, formatPercent } from "@/lib/format";
import { todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { ExportLinks } from "../export-links";
import { MonthNav } from "../month-nav";

export const metadata = { title: "DRE" };

type Params = PageProps<"/financeiro/dre">["searchParams"];

export default function DrePage({ searchParams }: PageProps<"/financeiro/dre">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Dre searchParams={searchParams} />
    </Suspense>
  );
}

const MONTH = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

async function Dre({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const raw = await searchParams;
  const period = parseMonth(raw.mes, todayIso());
  const range = lastMonths(period.month, 6);
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_dre", {
    p_org: membership.organizationId,
    p_from: range.from,
    p_to: range.to,
  });
  const months = data ?? [];

  const lines: {
    label: string;
    key: "gross_revenue" | "fees" | "material_cost" | "expenses" | "result";
    sign?: "-" | "=";
  }[] = [
    { label: "Receita bruta", key: "gross_revenue" },
    { label: "(−) Taxas de pagamento e marketplace", key: "fees", sign: "-" },
    { label: "(−) Custo dos insumos", key: "material_cost", sign: "-" },
    { label: "(−) Despesas", key: "expenses", sign: "-" },
    { label: "(=) Resultado", key: "result", sign: "=" },
  ];

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <MonthNav basePath="/financeiro/dre" {...period} />
        <ExportLinks report="dre" params={{ mes: period.month }} />
      </div>
      <p className="text-sm text-muted-foreground">
        Seis meses até {period.label.toLowerCase()}. Receita pela confirmação dos pedidos; custo dos
        insumos pelo custo médio de cada baixa; despesas pelo vencimento das contas a pagar.
      </p>

      {/* Celular: um cartão por mês. */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {[...months].reverse().map((m) => (
          <li key={m.month} className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="mb-2 font-semibold capitalize">
              {MONTH.format(new Date(`${m.month}T12:00:00Z`))}
            </p>
            <dl className="flex flex-col gap-1 text-sm">
              {lines.map((l) => (
                <div
                  key={l.key}
                  className={cn(
                    "flex justify-between gap-3",
                    l.sign === "=" && "border-t pt-1 font-semibold",
                  )}
                >
                  <dt className="text-muted-foreground">{l.label}</dt>
                  <dd className={cn(l.sign === "=" && m.result < 0 && "text-destructive")}>
                    {formatCurrency(m[l.key])}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <dt>Margem</dt>
                <dd>
                  {m.gross_revenue > 0
                    ? formatPercent(Math.round((m.result / m.gross_revenue) * 1000) / 10)
                    : "—"}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {/* Computador: tabela meses × linhas. */}
      <div className="hidden overflow-x-auto rounded-2xl border bg-card shadow-sm lg:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium" />
              {months.map((m) => (
                <th key={m.month} className="px-4 py-3 text-right font-medium capitalize">
                  {MONTH.format(new Date(`${m.month}T12:00:00Z`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.key} className={cn(l.sign === "=" && "bg-muted/30 font-semibold")}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  {l.label}
                </th>
                {months.map((m) => (
                  <td
                    key={m.month}
                    className={cn(
                      "px-4 py-2.5 text-right",
                      l.sign === "=" && m.result < 0 && "text-destructive",
                    )}
                  >
                    {formatCurrency(m[l.key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="text-xs text-muted-foreground">
              <th scope="row" className="px-4 py-2.5 text-left font-medium">
                Margem
              </th>
              {months.map((m) => (
                <td key={m.month} className="px-4 py-2.5 text-right">
                  {m.gross_revenue > 0
                    ? formatPercent(Math.round((m.result / m.gross_revenue) * 1000) / 10)
                    : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

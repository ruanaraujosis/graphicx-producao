import { ArrowDownCircle, ArrowUpCircle, CalendarClock, Wallet } from "lucide-react";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { StatCard } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { parseMonth } from "@/lib/finance/period";
import { formatCurrency } from "@/lib/format";
import { formatDueDate, todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { ExportLinks } from "../export-links";
import { MonthNav } from "../month-nav";

export const metadata = { title: "Fluxo de caixa" };

type Params = PageProps<"/financeiro/caixa">["searchParams"];

export default function CaixaPage({ searchParams }: PageProps<"/financeiro/caixa">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Caixa searchParams={searchParams} />
    </Suspense>
  );
}

async function Caixa({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const raw = await searchParams;
  const today = todayIso();
  const period = parseMonth(raw.mes, today);
  const supabase = await createClient();
  const { data } = await supabase.rpc("finance_cash_flow", {
    p_org: membership.organizationId,
    p_from: period.from,
    p_to: period.to,
  });
  const days = data ?? [];
  // Realizado: até hoje. Previsto: contas em aberto que vencem depois de hoje.
  const sum = (k: "received" | "paid" | "to_receive" | "to_pay", future: boolean) =>
    days.filter((d) => (future ? d.day > today : d.day <= today)).reduce((s, d) => s + d[k], 0);
  const received = sum("received", false);
  const paid = sum("paid", false);
  const toReceive = sum("to_receive", true);
  const toPay = sum("to_pay", true);

  // Saldo acumulado do mês: realizado até hoje, previsto depois.
  const rows = days
    .reduce<((typeof days)[number] & { isPast: boolean; balance: number })[]>((acc, d) => {
      const isPast = d.day <= today;
      const before = acc.at(-1)?.balance ?? 0;
      acc.push({
        ...d,
        isPast,
        balance: before + (isPast ? d.received - d.paid : d.to_receive - d.to_pay),
      });
      return acc;
    }, [])
    .filter((d) => (d.isPast ? d.received || d.paid : d.to_receive || d.to_pay));

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <MonthNav basePath="/financeiro/caixa" {...period} />
        <ExportLinks report="caixa" params={{ mes: period.month }} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ArrowDownCircle}
          tone="success"
          value={formatCurrency(received)}
          label="Recebido (líquido)"
        />
        <StatCard icon={ArrowUpCircle} tone="danger" value={formatCurrency(paid)} label="Pago" />
        <StatCard
          icon={CalendarClock}
          tone="info"
          value={formatCurrency(toReceive - toPay)}
          label="Previsto até o fim do mês (receber − pagar)"
        />
        <StatCard
          icon={Wallet}
          tone={received - paid + toReceive - toPay >= 0 ? "teal" : "danger"}
          value={formatCurrency(received - paid + toReceive - toPay)}
          label="Saldo previsto do mês"
        />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma entrada ou saída neste mês.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Dia</th>
                <th className="px-4 py-3 text-right font-medium">Entradas</th>
                <th className="px-4 py-3 text-right font-medium">Saídas</th>
                <th className="px-4 py-3 text-right font-medium">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => (
                <tr key={d.day} className={cn(!d.isPast && "text-muted-foreground")}>
                  <td className="px-4 py-2.5">
                    {formatDueDate(d.day).slice(0, 5)}
                    {!d.isPast && <span className="ml-2 text-xs">previsto</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-success">
                    {formatCurrency(d.isPast ? d.received : d.to_receive)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-destructive">
                    {formatCurrency(d.isPast ? d.paid : d.to_pay)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-medium",
                      d.balance < 0 && "text-destructive",
                    )}
                  >
                    {formatCurrency(d.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Até hoje: o que foi recebido e pago. Depois de hoje: contas em aberto pelo vencimento.
        Contas vencidas e não pagas não entram no previsto — confira em A receber e A pagar.
      </p>
    </>
  );
}

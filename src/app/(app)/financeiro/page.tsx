import { AlarmClock, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { StatCard } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { goalsFromMonthly, progressPct } from "@/lib/finance/goals";
import { formatCurrency } from "@/lib/format";
import { addDays, todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { revenueSince } from "./data";
import { GoalDialog } from "./finance-dialogs";

export const metadata = { title: "Financeiro" };

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <VisaoGeral />
    </Suspense>
  );
}

async function VisaoGeral() {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const org = membership.organizationId;
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const supabase = await createClient();

  const [revenue, settings, openRec, openPay, flow] = await Promise.all([
    revenueSince(org, weekStart < monthStart ? weekStart : monthStart),
    supabase
      .from("organization_settings")
      .select("monthly_goal")
      .eq("organization_id", org)
      .maybeSingle(),
    supabase
      .from("receivables")
      .select("net, due_date")
      .eq("organization_id", org)
      .eq("status", "aberto"),
    supabase
      .from("payables")
      .select("amount, due_date")
      .eq("organization_id", org)
      .eq("status", "aberto"),
    supabase.rpc("finance_cash_flow", { p_org: org, p_from: monthStart, p_to: today }),
  ]);

  const sum = (rows: { total: number; day: string }[], from: string) =>
    rows.filter((r) => r.day >= from).reduce((s, r) => s + r.total, 0);
  const done = {
    day: sum(revenue, today),
    week: sum(revenue, weekStart),
    month: sum(revenue, monthStart),
  };
  const goal = goalsFromMonthly(settings.data?.monthly_goal ?? null, today);
  const receivable = openRec.data ?? [];
  const payable = openPay.data ?? [];
  const recTotal = receivable.reduce((s, r) => s + (r.net ?? 0), 0);
  const recLate = receivable
    .filter((r) => r.due_date < today)
    .reduce((s, r) => s + (r.net ?? 0), 0);
  const payTotal = payable.reduce((s, r) => s + r.amount, 0);
  const payLate = payable.filter((r) => r.due_date < today).reduce((s, r) => s + r.amount, 0);
  const received = (flow.data ?? []).reduce((s, d) => s + d.received, 0);
  const paid = (flow.data ?? []).reduce((s, d) => s + d.paid, 0);
  const canEditGoal = can(membership.permissions, [
    "financeiro.gerenciar",
    "configuracoes.gerenciar",
  ]);

  return (
    <>
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Faturamento</h2>
            <p className="text-sm text-muted-foreground">
              Pedidos confirmados (sem cancelados). A meta do dia e da semana sai da meta do mês,
              pelos dias úteis.
            </p>
          </div>
          {canEditGoal && <GoalDialog monthlyGoal={settings.data?.monthly_goal ?? null} />}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <GoalBar label="Hoje" value={done.day} goal={goal.day} />
          <GoalBar label="Semana" value={done.week} goal={goal.week} />
          <GoalBar label="Mês" value={done.month} goal={goal.month} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ArrowDownCircle}
          tone="info"
          value={formatCurrency(recTotal)}
          label="A receber (em aberto)"
        />
        <StatCard
          icon={AlarmClock}
          tone={recLate ? "danger" : "success"}
          value={formatCurrency(recLate)}
          label="Recebimentos vencidos"
        />
        <StatCard
          icon={ArrowUpCircle}
          tone="warning"
          value={formatCurrency(payTotal)}
          label="A pagar (em aberto)"
        />
        <StatCard
          icon={AlarmClock}
          tone={payLate ? "danger" : "success"}
          value={formatCurrency(payLate)}
          label="Pagamentos vencidos"
        />
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={ArrowDownCircle}
          tone="success"
          value={formatCurrency(received)}
          label="Recebido no mês (líquido)"
        />
        <StatCard
          icon={ArrowUpCircle}
          tone="danger"
          value={formatCurrency(paid)}
          label="Pago no mês"
        />
        <StatCard
          icon={Wallet}
          tone={received - paid >= 0 ? "teal" : "danger"}
          value={formatCurrency(received - paid)}
          label="Saldo do mês"
        />
      </section>

      <p className="text-sm text-muted-foreground">
        Detalhes em{" "}
        <Link href="/financeiro/caixa" className="text-primary hover:underline">
          Fluxo de caixa
        </Link>{" "}
        e{" "}
        <Link href="/financeiro/dre" className="text-primary hover:underline">
          DRE
        </Link>
        .
      </p>
    </>
  );
}

function GoalBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = progressPct(value, goal);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {goal > 0 && <span className="text-xs font-medium">{pct}%</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight">{formatCurrency(value)}</p>
      {goal > 0 ? (
        <>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${pct}% da meta`}
          >
            <div
              className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">Meta: {formatCurrency(goal)}</span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">Sem meta definida</span>
      )}
    </div>
  );
}

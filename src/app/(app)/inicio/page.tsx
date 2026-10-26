import {
  AlarmClock,
  CalendarClock,
  ClipboardList,
  MessageSquareWarning,
  Palette,
  PackageX,
  Plus,
  ShoppingCart,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { Suspense } from "react";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { DueBadge, StatusPill } from "@/components/kit/order-badges";
import { PageHeader } from "@/components/kit/page-header";
import { StatCard } from "@/components/kit/stat-card";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { progressPct } from "@/lib/finance/goals";
import { formatCurrency, formatDateTime, TIME_ZONE } from "@/lib/format";
import { todayIso } from "@/lib/orders/deadline";
import { rankBy, uniqueByOrder, type RankingEntry } from "@/lib/orders/ranking";
import { BOARD_STATUSES, STATUS_LABELS, orderNumber, type OrderStatus } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Início" };

/** Etapas em que o pedido ainda está em andamento. */
const OPEN = BOARD_STATUSES.filter((s) => !["enviado", "entregue"].includes(s));

export default function InicioPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-14 w-72 animate-pulse rounded-xl bg-muted" />}>
        <Greeting />
      </Suspense>
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        }
      >
        <Dashboard />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <TeamRanking />
      </Suspense>
    </div>
  );
}

function greetingFor(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: TIME_ZONE,
    }).format(date),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function Greeting() {
  const { session, membership } = await requireOrg();
  const firstName = session.fullName.split(" ")[0];
  const canSell = can(membership.permissions, "pedidos.gerenciar");
  return (
    <PageHeader
      title={`${greetingFor(new Date())}, ${firstName}!`}
      description={`${membership.name} · o dia de hoje em números.`}
      actions={
        canSell ? (
          <>
            <Button asChild variant="outline">
              <Link href="/pedidos/venda-rapida">
                <ShoppingCart />
                Venda rápida
              </Link>
            </Button>
            <Button asChild>
              <Link href="/pedidos/novo">
                <Plus />
                Novo pedido
              </Link>
            </Button>
          </>
        ) : undefined
      }
    />
  );
}

function Card({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-primary hover:underline">
            Ver tudo
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

async function Dashboard() {
  const { membership } = await requireOrg();
  const org = membership.organizationId;
  const perms = membership.permissions;
  const seeOrders = can(perms, ["pedidos.ver", "pcp.ver", "expedicao.ver"]);
  const seeMoney = can(perms, "financeiro.ver");
  const seeArt = can(perms, "artes.ver");
  const seeStock = can(perms, "estoque.ver");
  const seeMarketing = can(perms, "marketing.ver");
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const supabase = await createClient();
  const none = Promise.resolve({ data: null, count: null });

  const [openRes, salesRes, goalRes, recentRes, stockRes, reviewsRes] = await Promise.all([
    seeOrders || seeArt
      ? supabase
          .from("orders")
          .select("id, number, customer_name, status, due_date, channel")
          .eq("organization_id", org)
          .in("status", [...OPEN])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(2000)
      : none,
    seeMoney
      ? supabase
          .from("orders")
          .select("total, confirmed_at")
          .eq("organization_id", org)
          .not("status", "in", "(orcamento,cancelado)")
          .gte("confirmed_at", `${monthStart}T00:00:00-03:00`)
          .limit(10000)
      : none,
    seeMoney
      ? supabase
          .from("organization_settings")
          .select("monthly_goal")
          .eq("organization_id", org)
          .maybeSingle()
      : none,
    seeOrders
      ? supabase
          .from("orders")
          .select("id, number, customer_name, status, channel, total, confirmed_at")
          .eq("organization_id", org)
          .not("status", "in", "(orcamento,cancelado)")
          .not("confirmed_at", "is", null)
          .order("confirmed_at", { ascending: false })
          .limit(6)
      : none,
    seeStock
      ? supabase
          .from("material_stock")
          .select("material_id, name, available, min_stock, unit", { count: "exact" })
          .eq("organization_id", org)
          .eq("below_min", true)
          .eq("active", true)
          .order("name")
          .limit(5)
      : none,
    seeMarketing
      ? supabase
          .from("marketplace_reviews")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org)
          .in("status", ["pendente", "erro"])
      : none,
  ]);

  const open = (openRes.data ?? []) as {
    id: string;
    number: number;
    customer_name: string;
    status: OrderStatus;
    due_date: string | null;
    channel: "balcao" | "shopee" | "whatsapp";
  }[];
  const dueToday = open.filter((o) => o.due_date === today).length;
  const late = open.filter((o) => o.due_date && o.due_date < today).length;
  const awaitingArt = open.filter((o) => o.status === "aguardando_aprovacao").length;
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(iso));
  const sales = (salesRes.data ?? []) as { total: number; confirmed_at: string }[];
  const todaySales = sales.filter((s) => dayOf(s.confirmed_at) === today);
  const todayTotal = todaySales.reduce((s, o) => s + Number(o.total), 0);
  const monthTotal = sales.reduce((s, o) => s + Number(o.total), 0);
  const goal = Number((goalRes.data as { monthly_goal: number | null } | null)?.monthly_goal ?? 0);
  const byStatus = new Map<OrderStatus, number>();
  for (const o of open) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
  const recent = (recentRes.data ?? []) as {
    id: string;
    number: number;
    customer_name: string;
    status: OrderStatus;
    channel: "balcao" | "shopee" | "whatsapp";
    total: number;
    confirmed_at: string;
  }[];
  const critical = (stockRes.data ?? []) as {
    material_id: string;
    name: string;
    available: number;
    min_stock: number;
    unit: string;
  }[];
  const maxStage = Math.max(1, ...OPEN.map((s) => byStatus.get(s) ?? 0));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {seeMoney && (
          <StatCard
            icon={Wallet}
            tone="success"
            value={formatCurrency(todayTotal)}
            label={`Vendas hoje (${todaySales.length})`}
          />
        )}
        {seeMoney && (
          <StatCard
            icon={TrendingUp}
            tone="primary"
            value={formatCurrency(monthTotal)}
            label="Vendas do mês"
          />
        )}
        {seeOrders && (
          <StatCard
            icon={ClipboardList}
            tone="info"
            value={open.length}
            label="Pedidos em andamento"
          />
        )}
        {seeOrders && (
          <StatCard icon={CalendarClock} tone="teal" value={dueToday} label="Prazo hoje" />
        )}
        {seeOrders && (
          <StatCard
            icon={AlarmClock}
            tone={late ? "danger" : "success"}
            value={late}
            label="Atrasados"
          />
        )}
        {seeArt && (
          <StatCard
            icon={Palette}
            tone="warning"
            value={awaitingArt}
            label="Artes aguardando o cliente"
          />
        )}
        {seeStock && (
          <StatCard
            icon={PackageX}
            tone={stockRes.count ? "danger" : "success"}
            value={stockRes.count ?? 0}
            label="Insumos abaixo do mínimo"
          />
        )}
        {seeMarketing && (
          <StatCard
            icon={MessageSquareWarning}
            tone={reviewsRes.count ? "warning" : "success"}
            value={reviewsRes.count ?? 0}
            label="Avaliações para revisar"
          />
        )}
      </div>

      {seeMoney && goal > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-semibold">Meta do mês</h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatCurrency(monthTotal)} de {formatCurrency(goal)} ·{" "}
              {progressPct(monthTotal, goal)}%
            </p>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progressPct(monthTotal, goal)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Meta do mês"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, progressPct(monthTotal, goal))}%` }}
            />
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {seeOrders && (
          <Card title="Produção agora" href="/pcp">
            <ul className="flex flex-col gap-2">
              {OPEN.map((s) => {
                const n = byStatus.get(s) ?? 0;
                return (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className="w-44 shrink-0 truncate text-muted-foreground">
                      {STATUS_LABELS[s]}
                    </span>
                    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(n / maxStage) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right font-medium tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {seeOrders && (
          <Card title="Próximos prazos" href="/pedidos">
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido em andamento.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {open.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/pedidos/${o.id}`}
                      className="flex flex-wrap items-center gap-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-semibold">{orderNumber(o.number)}</span>
                      <span className="min-w-0 flex-1 truncate">{o.customer_name}</span>
                      <StatusPill status={o.status} />
                      <DueBadge due={o.due_date} status={o.status} today={today} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {seeOrders && (
          <Card title="Últimas vendas" href="/pedidos">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma venda ainda.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recent.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/pedidos/${o.id}`}
                      className="flex flex-wrap items-center gap-2 py-2 text-sm hover:bg-muted/50"
                    >
                      <span className="font-semibold">{orderNumber(o.number)}</span>
                      <span className="min-w-0 flex-1 truncate">{o.customer_name}</span>
                      <ChannelBadge channel={o.channel} />
                      {seeMoney && <span className="tabular-nums">{formatCurrency(o.total)}</span>}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(o.confirmed_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {seeStock && (
          <Card title="Estoque crítico" href="/estoque/compras">
            {critical.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum insumo abaixo do mínimo. 👍</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm">
                {critical.map((m) => (
                  <li key={m.material_id} className="flex justify-between gap-2 py-2">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-destructive tabular-nums">
                      {Number(m.available).toLocaleString("pt-BR")} / mín.{" "}
                      {Number(m.min_stock).toLocaleString("pt-BR")} {m.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

/** Cor da posição: 1º ouro, 2º e 3º em destaque, o resto neutro. */
const PODIUM = [
  "bg-warning-soft text-warning",
  "bg-info-soft text-info",
  "bg-secondary text-secondary-foreground",
];

function RankingList({
  entries,
  nameById,
  value,
  empty,
}: {
  entries: RankingEntry[];
  nameById: Map<string, string>;
  value: (e: RankingEntry) => string;
  empty: string;
}) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e, index) => (
        <li key={e.userId} className="flex items-center gap-3 text-sm">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums",
              PODIUM[index] ?? "bg-muted text-muted-foreground",
            )}
            aria-label={`${index + 1}º lugar`}
          >
            {index === 0 ? <Trophy className="size-4" aria-hidden /> : index + 1}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">
                {nameById.get(e.userId) ?? "Pessoa removida"}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{value(e)}</span>
            </div>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(e.count / max) * 100}%` }}
              />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function TeamRanking() {
  const { membership } = await requireOrg();
  const org = membership.organizationId;
  const perms = membership.permissions;
  const seeSales = can(perms, "pedidos.ver");
  const seeProduction = can(perms, "pcp.ver");
  const seeMoney = can(perms, "financeiro.ver");
  if (!seeSales && !seeProduction) return null;

  const since = `${todayIso().slice(0, 7)}-01T00:00:00-03:00`;
  const supabase = await createClient();
  const none = Promise.resolve({ data: null });
  const [salesRes, producedRes] = await Promise.all([
    // Pedidos da Shopee entram sozinhos: não contam como venda de ninguém.
    seeSales
      ? supabase
          .from("orders")
          .select("created_by, total")
          .eq("organization_id", org)
          .neq("channel", "shopee")
          .not("status", "in", "(orcamento,cancelado)")
          .gte("confirmed_at", since)
          .limit(10000)
      : none,
    // Produzido = pedido que a pessoa levou à Expedição (fim da produção).
    seeProduction
      ? supabase
          .from("order_events")
          .select("order_id, actor_id")
          .eq("organization_id", org)
          .eq("type", "status")
          .eq("to_status", "expedicao")
          .gte("created_at", since)
          .limit(10000)
      : none,
  ]);

  const sellers = rankBy(
    (salesRes.data ?? []).map((o) => ({ userId: o.created_by, total: o.total })),
    seeMoney ? "total" : "count",
  );
  const producers = rankBy(
    uniqueByOrder(producedRes.data ?? []).map((e) => ({ userId: e.actor_id })),
  );
  const ids = [...new Set([...sellers, ...producers].map((e) => e.userId))];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: TIME_ZONE }).format(
    new Date(),
  );

  return (
    <section aria-labelledby="ranking" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ranking" className="font-heading text-base font-semibold">
          Ranking da equipe
        </h2>
        <p className="text-sm text-muted-foreground">Desde o dia 1º de {month}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {seeSales && (
          <Card title="Quem mais vendeu">
            <RankingList
              entries={sellers}
              nameById={nameById}
              value={(e) =>
                seeMoney
                  ? `${formatCurrency(e.total)} · ${plural(e.count, "pedido", "pedidos")}`
                  : plural(e.count, "pedido", "pedidos")
              }
              empty="Nenhuma venda lançada pela equipe neste mês."
            />
          </Card>
        )}
        {seeProduction && (
          <Card title="Quem mais produziu">
            <RankingList
              entries={producers}
              nameById={nameById}
              value={(e) => plural(e.count, "pedido pronto", "pedidos prontos")}
              empty="Nenhum pedido chegou à Expedição neste mês."
            />
          </Card>
        )}
      </div>
    </section>
  );
}

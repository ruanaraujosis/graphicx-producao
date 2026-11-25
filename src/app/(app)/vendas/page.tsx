import { BadgePercent, Plus, Receipt, ShoppingCart, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { DataList, Pagination } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { StatusPill } from "@/components/kit/order-badges";
import { PageHeader } from "@/components/kit/page-header";
import { StatCard } from "@/components/kit/stat-card";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { addDays, todayIso } from "@/lib/orders/deadline";
import { orderNumber } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Vendas" };

const PERIODS = {
  hoje: { label: "Hoje", days: 0 },
  semana: { label: "7 dias", days: 6 },
  mes: { label: "30 dias", days: 29 },
  todas: { label: "Todas", days: null },
} as const;
type Period = keyof typeof PERIODS;

type Params = PageProps<"/vendas">["searchParams"];

export default function VendasPage({ searchParams }: PageProps<"/vendas">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Vendas searchParams={searchParams} />
    </Suspense>
  );
}

async function Vendas({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["vendas.ver", "pedidos.ver"]);
  const raw = await searchParams;
  const { q, page, from, to } = parseListParams(raw);
  const period: Period =
    typeof raw.periodo === "string" && raw.periodo in PERIODS ? (raw.periodo as Period) : "hoje";
  const org = membership.organizationId;
  const days = PERIODS[period].days;
  const since = days === null ? null : `${addDays(todayIso(), -days)}T00:00:00-03:00`;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, number, status, channel, customer_name, seller_id, total, discount, discount_percent, first_purchase, sold_at, created_at",
      { count: "exact" },
    )
    .eq("organization_id", org)
    .eq("kind", "venda");
  if (since) query = query.gte("created_at", since);
  if (q) {
    const n = Number(q.replace(/\D/g, ""));
    query =
      /^#?\d+$/.test(q) && n > 0
        ? query.eq("number", n)
        : query.ilike("customer_name", ilikeTerm(q));
  }

  let totals = supabase
    .from("orders")
    .select("total, discount")
    .eq("organization_id", org)
    .eq("kind", "venda")
    .eq("status", "vendido")
    .limit(20000);
  if (since) totals = totals.gte("created_at", since);

  const [{ data, count }, totalsRes, membersRes] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, to),
    totals,
    supabase
      .from("organization_members")
      .select("user_id, profiles(full_name)")
      .eq("organization_id", org),
  ]);
  const rows = data ?? [];
  const names = new Map(
    (membersRes.data ?? []).map((m) => [m.user_id, m.profiles?.full_name ?? ""]),
  );
  const sold = totalsRes.data ?? [];
  const revenue = sold.reduce((s, o) => s + o.total, 0);
  const discounts = sold.reduce((s, o) => s + o.discount, 0);
  const canSell = can(membership.permissions, ["pedidos.gerenciar", "vendas.gerenciar"]);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { periodo: period === "hoje" ? undefined : period, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.size ? `/vendas?${p}` : "/vendas";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendas"
        description="Pedidos de venda do balcão e do WhatsApp. Venda concluída não é editada: só cancelada ou devolvida."
        actions={
          canSell ? (
            <Button asChild>
              <Link href="/vendas/nova">
                <Plus />
                Nova venda
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Wallet} tone="success" value={formatCurrency(revenue)} label="Vendido" />
        <StatCard icon={Receipt} tone="primary" value={sold.length} label="Vendas" />
        <StatCard
          icon={ShoppingCart}
          tone="info"
          value={formatCurrency(sold.length ? revenue / sold.length : 0)}
          label="Ticket médio"
        />
        <StatCard
          icon={BadgePercent}
          tone="warning"
          value={formatCurrency(discounts)}
          label="Descontos"
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Período" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <li key={p}>
                <Link
                  href={href({ periodo: p === "hoje" ? undefined : p, pagina: undefined })}
                  aria-current={period === p ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                    period === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  {PERIODS[p].label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ListSearch placeholder="Buscar por número ou cliente" />
      </div>

      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty={q ? `Nenhuma venda encontrada para "${q}".` : "Nenhuma venda neste período."}
        card={{
          title: (r) => (
            <Link href={`/pedidos/${r.id}`} className="hover:text-primary hover:underline">
              {orderNumber(r.number)} · {r.customer_name}
            </Link>
          ),
          subtitle: (r) =>
            `${formatCurrency(r.total)} · ${formatDateTime(r.sold_at ?? r.created_at)} · ${names.get(r.seller_id ?? "") || "—"}`,
          extra: (r) => (
            <>
              <StatusPill status={r.status} />
              <ChannelBadge channel={r.channel} />
              {r.first_purchase && <FirstPurchase />}
            </>
          ),
        }}
        columns={[
          {
            header: "Venda",
            cell: (r) => (
              <Link
                href={`/pedidos/${r.id}`}
                className="font-semibold text-primary hover:underline"
              >
                {orderNumber(r.number)}
              </Link>
            ),
          },
          {
            header: "Cliente",
            cell: (r) => (
              <span className="flex items-center gap-2 font-medium">
                {r.customer_name}
                {r.first_purchase && <FirstPurchase />}
              </span>
            ),
          },
          { header: "Vendedor", cell: (r) => names.get(r.seller_id ?? "") || "—" },
          { header: "Quando", cell: (r) => formatDateTime(r.sold_at ?? r.created_at) },
          { header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          {
            header: "Desconto",
            cell: (r) =>
              r.discount > 0
                ? `${formatCurrency(r.discount)} (${r.discount_percent.toLocaleString("pt-BR")}%)`
                : "—",
          },
          { header: "Total", cell: (r) => formatCurrency(r.total) },
        ]}
      />
      <Pagination
        basePath="/vendas"
        page={page}
        total={count ?? 0}
        q={q}
        params={{ periodo: period === "hoje" ? undefined : period }}
      />
    </div>
  );
}

function FirstPurchase() {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-success-soft px-2 text-xs font-medium text-success">
      1ª compra
    </span>
  );
}

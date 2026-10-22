import { AlarmClock, ClipboardList, Hourglass, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { CHANNELS, ChannelBadge } from "@/components/kit/channel-badge";
import { DataList, Pagination } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { DueBadge, StatusPill } from "@/components/kit/order-badges";
import { PageHeader } from "@/components/kit/page-header";
import { StatCard } from "@/components/kit/stat-card";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { SALES_CHANNELS, type SalesChannel } from "@/lib/catalog/pricing";
import { formatCurrency, formatDate } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { todayIso } from "@/lib/orders/deadline";
import { orderNumber, type OrderStatus } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pedidos" };

const OPEN: OrderStatus[] = [
  "novo",
  "aguardando_arte",
  "arte_em_criacao",
  "aguardando_aprovacao",
  "aprovado",
  "em_impressao",
  "acabamento",
  "expedicao",
];

const VIEWS = {
  abertos: { label: "Em andamento", statuses: OPEN },
  atrasados: { label: "Atrasados", statuses: OPEN },
  orcamentos: { label: "Orçamentos", statuses: ["orcamento"] as OrderStatus[] },
  finalizados: {
    label: "Enviados e entregues",
    statuses: ["enviado", "entregue"] as OrderStatus[],
  },
  cancelados: { label: "Cancelados", statuses: ["cancelado"] as OrderStatus[] },
  todos: { label: "Todos", statuses: null },
} as const;
type View = keyof typeof VIEWS;

type Params = PageProps<"/pedidos">["searchParams"];

export default function PedidosPage({ searchParams }: PageProps<"/pedidos">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Pedidos searchParams={searchParams} />
    </Suspense>
  );
}

async function Pedidos({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg("pedidos.ver");
  const raw = await searchParams;
  const { q, page, from, to } = parseListParams(raw);
  const view: View =
    typeof raw.ver === "string" && raw.ver in VIEWS ? (raw.ver as View) : "abertos";
  const channel =
    typeof raw.canal === "string" && (SALES_CHANNELS as readonly string[]).includes(raw.canal)
      ? (raw.canal as SalesChannel)
      : undefined;
  const org = membership.organizationId;
  const today = todayIso();
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, number, status, channel, customer_name, due_date, total, needs_art, created_at, order_items(count)",
      { count: "exact" },
    )
    .eq("organization_id", org);
  const statuses = VIEWS[view].statuses;
  if (statuses) query = query.in("status", statuses);
  if (view === "atrasados") query = query.lt("due_date", today);
  if (channel) query = query.eq("channel", channel);
  if (q) {
    const n = Number(q.replace(/\D/g, ""));
    query =
      /^#?\d+$/.test(q) && n > 0
        ? query.eq("number", n)
        : query.ilike("customer_name", ilikeTerm(q));
  }
  query =
    view === "abertos" || view === "atrasados"
      ? query.order("due_date", { ascending: true, nullsFirst: false }).order("number")
      : query.order("created_at", { ascending: false });

  const [{ data, count }, openRes, lateRes, todayRes, approvalRes] = await Promise.all([
    query.range(from, to),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .in("status", OPEN),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .in("status", OPEN)
      .lt("due_date", today),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .in("status", OPEN)
      .eq("due_date", today),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("status", "aguardando_aprovacao"),
  ]);
  const rows = data ?? [];
  const canManage = can(membership.permissions, "pedidos.gerenciar");

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = {
      ver: view === "abertos" ? undefined : view,
      canal: channel,
      q: q || undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.size ? `/pedidos?${p}` : "/pedidos";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pedidos"
        description="Todos os canais numa lista só, com a data limite de postagem."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/pedidos/novo">
                <Plus />
                Novo pedido
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          tone="primary"
          value={openRes.count ?? 0}
          label="Em andamento"
        />
        <StatCard
          icon={AlarmClock}
          tone={lateRes.count ? "danger" : "success"}
          value={lateRes.count ?? 0}
          label="Atrasados"
        />
        <StatCard icon={Hourglass} tone="warning" value={todayRes.count ?? 0} label="Postam hoje" />
        <StatCard
          icon={Palette}
          tone="info"
          value={approvalRes.count ?? 0}
          label="Aguardando aprovação"
        />
      </div>

      <nav aria-label="Filtrar pedidos" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <li key={v}>
              <Link
                href={href({ ver: v === "abertos" ? undefined : v, pagina: undefined })}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                  view === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card hover:bg-muted",
                )}
              >
                {VIEWS[v].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <ListSearch placeholder="Buscar por número ou cliente" />
        <ul className="flex flex-wrap gap-1.5" aria-label="Filtrar por canal">
          <li>
            <Link
              href={href({ canal: undefined })}
              aria-current={!channel ? "true" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium md:min-h-8",
                !channel
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              Todos os canais
            </Link>
          </li>
          {SALES_CHANNELS.map((c) => (
            <li key={c}>
              <Link
                href={href({ canal: channel === c ? undefined : c })}
                aria-current={channel === c ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium md:min-h-8",
                  CHANNELS[c].className,
                  channel === c && "ring-2 ring-current",
                )}
              >
                <span aria-hidden className={cn("size-1.5 rounded-full", CHANNELS[c].dot)} />
                {CHANNELS[c].label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          q
            ? `Nenhum pedido encontrado para "${q}".`
            : "Nenhum pedido aqui. Use “Novo pedido” para começar."
        }
        card={{
          title: (r) => (
            <Link href={`/pedidos/${r.id}`} className="hover:text-primary hover:underline">
              {orderNumber(r.number)} · {r.customer_name}
            </Link>
          ),
          subtitle: (r) =>
            `${r.order_items[0]?.count ?? 0} item(ns) · ${formatCurrency(r.total)} · ${formatDate(r.created_at)}`,
          extra: (r) => (
            <>
              <StatusPill status={r.status} />
              <DueBadge due={r.due_date} status={r.status} today={today} />
              <ChannelBadge channel={r.channel} />
            </>
          ),
        }}
        columns={[
          {
            header: "Pedido",
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
            cell: (r) => <span className="font-medium">{r.customer_name}</span>,
          },
          { header: "Canal", cell: (r) => <ChannelBadge channel={r.channel} /> },
          { header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          {
            header: "Postagem",
            cell: (r) =>
              r.due_date ? <DueBadge due={r.due_date} status={r.status} today={today} /> : "—",
          },
          { header: "Itens", cell: (r) => r.order_items[0]?.count ?? 0 },
          { header: "Total", cell: (r) => formatCurrency(r.total) },
        ]}
      />
      <Pagination
        basePath="/pedidos"
        page={page}
        total={count ?? 0}
        q={q}
        params={{ ver: view === "abertos" ? undefined : view, canal: channel }}
      />
    </div>
  );
}

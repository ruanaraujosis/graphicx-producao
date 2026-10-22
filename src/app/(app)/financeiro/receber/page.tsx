import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { formatDueDate, todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { ExportLinks } from "../export-links";
import { NewReceivableButton, ReceivableActions, type ReceivableRow } from "../finance-dialogs";
import { RECEIVABLE_STATUS } from "../schema";

export const metadata = { title: "Contas a receber" };

const RECEIVABLE_VIEWS = {
  abertas: "Em aberto",
  vencidas: "Vencidas",
  recebidas: "Recebidas",
  canceladas: "Canceladas",
  todas: "Todas",
} as const;
type View = keyof typeof RECEIVABLE_VIEWS;

type Params = PageProps<"/financeiro/receber">["searchParams"];

export default function ReceberPage({ searchParams }: PageProps<"/financeiro/receber">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Receber searchParams={searchParams} />
    </Suspense>
  );
}

async function Receber({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const raw = await searchParams;
  const { q, page, from, to } = parseListParams(raw);
  const view: View =
    typeof raw.ver === "string" && raw.ver in RECEIVABLE_VIEWS ? (raw.ver as View) : "abertas";
  const today = todayIso();
  const supabase = await createClient();

  let query = supabase
    .from("receivables")
    .select(
      "id, order_id, description, customer_name, channel, gross, fee, net, due_date, received_at, status, notes, orders(number)",
      {
        count: "exact",
      },
    )
    .eq("organization_id", membership.organizationId);
  if (view === "abertas") query = query.eq("status", "aberto");
  if (view === "vencidas") query = query.eq("status", "aberto").lt("due_date", today);
  if (view === "recebidas") query = query.eq("status", "recebido");
  if (view === "canceladas") query = query.eq("status", "cancelado");
  if (q) {
    const term = ilikeTerm(q);
    query = query.or(`description.ilike.${term},customer_name.ilike.${term}`);
  }
  query =
    view === "recebidas"
      ? query.order("received_at", { ascending: false })
      : query.order("due_date", { ascending: view !== "todas" && view !== "canceladas" });

  const { data, count } = await query.range(from, to);
  const rows = (data ?? []).map((r) => ({ ...r, status: r.status as ReceivableRow["status"] }));
  const totalNet = rows.reduce((s, r) => s + (r.net ?? 0), 0);
  const canManage = can(membership.permissions, "financeiro.gerenciar");

  const href = (v: View) => {
    const p = new URLSearchParams();
    if (v !== "abertas") p.set("ver", v);
    if (q) p.set("q", q);
    return p.size ? `/financeiro/receber?${p}` : "/financeiro/receber";
  };

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Filtrar contas" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {(Object.keys(RECEIVABLE_VIEWS) as View[]).map((v) => (
              <li key={v}>
                <Link
                  href={href(v)}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
                    view === v
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  {RECEIVABLE_VIEWS[v]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap gap-2">
          <ExportLinks report="receber" params={{ ver: view, q: q || undefined }} />
          {canManage && <NewReceivableButton today={today} />}
        </div>
      </div>

      <ListSearch placeholder="Buscar por descrição ou cliente" />

      <p className="text-sm text-muted-foreground">
        {count ?? 0} conta(s) · líquido nesta página:{" "}
        <strong className="text-foreground">{formatCurrency(totalNet)}</strong>
      </p>

      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => r.status === "cancelado"}
        empty="Nenhuma conta aqui. As contas dos pedidos entram sozinhas quando o pedido é confirmado."
        card={{
          title: (r) => r.description,
          subtitle: (r) =>
            [r.customer_name, `vence ${formatDueDate(r.due_date)}`].filter(Boolean).join(" · "),
          extra: (r) => (
            <>
              <Pill tone={RECEIVABLE_STATUS[r.status].tone}>
                {RECEIVABLE_STATUS[r.status].label}
              </Pill>
              {r.status === "aberto" && r.due_date < today && <Pill tone="danger">Vencida</Pill>}
              <Pill>{`Líquido ${formatCurrency(r.net ?? 0)}`}</Pill>
              {r.channel && <ChannelBadge channel={r.channel} />}
            </>
          ),
        }}
        columns={[
          {
            header: "Descrição",
            cell: (r) => (
              <div className="min-w-0">
                {r.order_id ? (
                  <Link
                    href={`/pedidos/${r.order_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.description}
                  </Link>
                ) : (
                  <p className="font-medium">{r.description}</p>
                )}
                {r.customer_name && (
                  <p className="truncate text-xs text-muted-foreground">{r.customer_name}</p>
                )}
              </div>
            ),
          },
          { header: "Vencimento", cell: (r) => formatDueDate(r.due_date) },
          { header: "Bruto", cell: (r) => formatCurrency(r.gross) },
          { header: "Taxa", cell: (r) => (r.fee ? formatCurrency(r.fee) : "—") },
          {
            header: "Líquido",
            cell: (r) => <span className="font-medium">{formatCurrency(r.net ?? 0)}</span>,
          },
          {
            header: "Situação",
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <Pill tone={RECEIVABLE_STATUS[r.status].tone}>
                  {r.status === "recebido" && r.received_at
                    ? `Recebido ${formatDueDate(r.received_at).slice(0, 5)}`
                    : RECEIVABLE_STATUS[r.status].label}
                </Pill>
                {r.status === "aberto" && r.due_date < today && <Pill tone="danger">Vencida</Pill>}
              </div>
            ),
          },
        ]}
        actions={canManage ? (r) => <ReceivableActions row={r} today={today} /> : undefined}
      />
      <Pagination
        basePath="/financeiro/receber"
        page={page}
        total={count ?? 0}
        q={q}
        params={{ ver: view === "abertas" ? undefined : view }}
      />
    </>
  );
}

import { Repeat } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { formatDueDate, todayIso } from "@/lib/orders/deadline";
import { createClient } from "@/lib/supabase/server";
import { payableOptions } from "../data";
import { ExportLinks } from "../export-links";
import {
  CategoriesDialog,
  NewPayableButton,
  PayableActions,
  type PayableRow,
} from "../finance-dialogs";
import { PAYABLE_STATUS } from "../schema";

export const metadata = { title: "Contas a pagar" };

const VIEWS = {
  abertas: "Em aberto",
  vencidas: "Vencidas",
  pagas: "Pagas",
  canceladas: "Canceladas",
  todas: "Todas",
} as const;
type View = keyof typeof VIEWS;

type Params = PageProps<"/financeiro/pagar">["searchParams"];

export default function PagarPage({ searchParams }: PageProps<"/financeiro/pagar">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Pagar searchParams={searchParams} />
    </Suspense>
  );
}

async function Pagar({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["financeiro.ver", "relatorios.ver"]);
  const org = membership.organizationId;
  const raw = await searchParams;
  const { q, page, from, to } = parseListParams(raw);
  const view: View =
    typeof raw.ver === "string" && raw.ver in VIEWS ? (raw.ver as View) : "abertas";
  const today = todayIso();
  const supabase = await createClient();

  let query = supabase
    .from("payables")
    .select(
      "id, description, supplier_id, category_id, amount, due_date, paid_at, status, recurrence, notes, suppliers(name), expense_categories(name)",
      { count: "exact" },
    )
    .eq("organization_id", org);
  if (view === "abertas") query = query.eq("status", "aberto");
  if (view === "vencidas") query = query.eq("status", "aberto").lt("due_date", today);
  if (view === "pagas") query = query.eq("status", "pago");
  if (view === "canceladas") query = query.eq("status", "cancelado");
  if (q) query = query.ilike("description", ilikeTerm(q));
  query =
    view === "pagas"
      ? query.order("paid_at", { ascending: false })
      : query.order("due_date", { ascending: view !== "todas" && view !== "canceladas" });

  const [{ data, count }, options] = await Promise.all([
    query.range(from, to),
    payableOptions(org),
  ]);
  const rows = (data ?? []).map((r) => ({
    ...r,
    status: r.status as PayableRow["status"],
    recurrence: r.recurrence as PayableRow["recurrence"],
  }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const canManage = can(membership.permissions, "financeiro.gerenciar");

  const href = (v: View) => {
    const p = new URLSearchParams();
    if (v !== "abertas") p.set("ver", v);
    if (q) p.set("q", q);
    return p.size ? `/financeiro/pagar?${p}` : "/financeiro/pagar";
  };

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav aria-label="Filtrar contas" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {(Object.keys(VIEWS) as View[]).map((v) => (
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
                  {VIEWS[v]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap gap-2">
          <ExportLinks report="pagar" params={{ ver: view, q: q || undefined }} />
          {canManage && <CategoriesDialog categories={options.categories} />}
          {canManage && (
            <NewPayableButton
              today={today}
              suppliers={options.suppliers}
              categories={options.categoryOptions}
            />
          )}
        </div>
      </div>

      <ListSearch placeholder="Buscar pela descrição" />

      <p className="text-sm text-muted-foreground">
        {count ?? 0} conta(s) · total nesta página:{" "}
        <strong className="text-foreground">{formatCurrency(total)}</strong>
      </p>

      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => r.status === "cancelado"}
        empty="Nenhuma conta aqui. Use “Nova conta” para lançar aluguel, compras, salários…"
        card={{
          title: (r) => r.description,
          subtitle: (r) =>
            [r.expense_categories?.name, r.suppliers?.name, `vence ${formatDueDate(r.due_date)}`]
              .filter(Boolean)
              .join(" · "),
          extra: (r) => (
            <>
              <Pill tone={PAYABLE_STATUS[r.status].tone}>{PAYABLE_STATUS[r.status].label}</Pill>
              {r.status === "aberto" && r.due_date < today && <Pill tone="danger">Vencida</Pill>}
              <Pill>{formatCurrency(r.amount)}</Pill>
              {r.recurrence === "mensal" && <Pill tone="secondary">Mensal</Pill>}
            </>
          ),
        }}
        columns={[
          {
            header: "Descrição",
            cell: (r) => (
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-medium">
                  {r.description}
                  {r.recurrence === "mensal" && (
                    <Repeat
                      className="size-3.5 text-muted-foreground"
                      aria-label="Repete todo mês"
                    />
                  )}
                </p>
                {r.suppliers?.name && (
                  <p className="truncate text-xs text-muted-foreground">{r.suppliers.name}</p>
                )}
              </div>
            ),
          },
          { header: "Categoria", cell: (r) => r.expense_categories?.name ?? "—" },
          { header: "Vencimento", cell: (r) => formatDueDate(r.due_date) },
          {
            header: "Valor",
            cell: (r) => <span className="font-medium">{formatCurrency(r.amount)}</span>,
          },
          {
            header: "Situação",
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <Pill tone={PAYABLE_STATUS[r.status].tone}>
                  {r.status === "pago" && r.paid_at
                    ? `Pago ${formatDueDate(r.paid_at).slice(0, 5)}`
                    : PAYABLE_STATUS[r.status].label}
                </Pill>
                {r.status === "aberto" && r.due_date < today && <Pill tone="danger">Vencida</Pill>}
              </div>
            ),
          },
        ]}
        actions={
          canManage
            ? (r) => (
                <PayableActions
                  row={r}
                  today={today}
                  suppliers={options.suppliers}
                  categories={options.categoryOptions}
                />
              )
            : undefined
        }
      />
      <Pagination
        basePath="/financeiro/pagar"
        page={page}
        total={count ?? 0}
        q={q}
        params={{ ver: view === "abertas" ? undefined : view }}
      />
    </>
  );
}

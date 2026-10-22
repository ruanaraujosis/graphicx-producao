import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { requireOrg } from "@/lib/auth/dal";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { parseListParams } from "@/lib/list-params";
import {
  MOVEMENT_LABELS,
  UNIT_SHORT,
  formatQuantity,
  onHandDelta,
  type Unit,
} from "@/lib/stock/units";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Movimentações" };

type Params = PageProps<"/estoque/movimentacoes">["searchParams"];

export default function MovimentacoesPage({ searchParams }: PageProps<"/estoque/movimentacoes">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Movimentacoes searchParams={searchParams} />
    </Suspense>
  );
}

const TONE = {
  entrada: "success",
  ajuste: "info",
  saida: "warning",
  perda: "danger",
  consumo: "secondary",
  reserva: "muted",
  liberacao: "muted",
} as const;

async function Movimentacoes({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg("estoque.ver");
  const { page, from, to } = parseListParams(await searchParams);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("stock_movements")
    .select(
      "id, type, quantity, unit_cost, reason, reference, created_by, created_at, materials(name, unit), product_variants(sku, name)",
      { count: "exact" },
    )
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  const authorIds = [...new Set((data ?? []).map((m) => m.created_by).filter(Boolean))] as string[];
  const { data: people } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const rows = (data ?? []).map((m) => {
    const unit = (m.materials?.unit ?? "un") as Unit;
    const delta = onHandDelta(m.type, m.quantity);
    const signed = m.type === "reserva" || m.type === "liberacao" ? m.quantity : delta;
    return {
      ...m,
      item:
        m.materials?.name ??
        (m.product_variants ? `${m.product_variants.sku} · ${m.product_variants.name}` : "—"),
      unit,
      amount: `${signed > 0 ? "+" : ""}${formatQuantity(signed, unit)}`,
      note: [m.reason, m.reference].filter(Boolean).join(" · ") || null,
      author: m.created_by ? (nameById.get(m.created_by) ?? "—") : "Sistema",
    };
  });

  return (
    <>
      <DataList
        rows={rows}
        rowKey={(r) => String(r.id)}
        empty="Nenhuma movimentação ainda. Use “Lançar movimentação” para registrar a primeira entrada."
        card={{
          title: (r) => r.item,
          subtitle: (r) => `${formatDateTime(r.created_at)} · ${r.author}`,
          extra: (r) => (
            <>
              <Pill tone={TONE[r.type]}>{MOVEMENT_LABELS[r.type]}</Pill>
              <Pill>{r.amount}</Pill>
              {r.unit_cost !== null && (
                <Pill>{`${formatCurrency(r.unit_cost)}/${UNIT_SHORT[r.unit]}`}</Pill>
              )}
              {r.note && <Pill>{r.note}</Pill>}
            </>
          ),
        }}
        columns={[
          { header: "Quando", cell: (r) => formatDateTime(r.created_at) },
          { header: "Item", cell: (r) => <span className="font-medium">{r.item}</span> },
          {
            header: "Tipo",
            cell: (r) => <Pill tone={TONE[r.type]}>{MOVEMENT_LABELS[r.type]}</Pill>,
          },
          { header: "Quantidade", cell: (r) => r.amount },
          {
            header: "Custo",
            cell: (r) =>
              r.unit_cost === null ? "—" : `${formatCurrency(r.unit_cost)}/${UNIT_SHORT[r.unit]}`,
          },
          { header: "Motivo", cell: (r) => r.note ?? "—" },
          { header: "Quem", cell: (r) => r.author },
        ]}
      />
      <Pagination basePath="/estoque/movimentacoes" page={page} total={count ?? 0} />
    </>
  );
}

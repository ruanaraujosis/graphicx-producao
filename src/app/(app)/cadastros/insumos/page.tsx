import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { formatQuantity, type Unit } from "@/lib/stock/units";
import { createClient } from "@/lib/supabase/server";
import { MaterialFormDialog, type MaterialRow } from "./material-form";

export const metadata = { title: "Insumos" };

type Params = PageProps<"/cadastros/insumos">["searchParams"];

export default function InsumosPage({ searchParams }: PageProps<"/cadastros/insumos">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Insumos searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Insumos({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["cadastros.ver", "estoque.ver"]);
  const canManage = can(membership.permissions, "cadastros.gerenciar");
  const { q, page, from, to } = parseListParams(await searchParams);
  const org = membership.organizationId;

  const supabase = await createClient();
  let query = supabase
    .from("materials")
    .select("id, name, sku, unit, avg_cost, min_stock, supplier_id, notes, active", {
      count: "exact",
    })
    .eq("organization_id", org)
    .order("active", { ascending: false })
    .order("name")
    .range(from, to);
  if (q) {
    const term = ilikeTerm(q);
    query = query.or(`name.ilike.${term},sku.ilike.${term}`);
  }
  const [{ data, count }, { data: suppliers }, { data: stock }] = await Promise.all([
    query,
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", org)
      .eq("active", true)
      .order("name"),
    supabase
      .from("material_stock")
      .select("material_id, on_hand, available, below_min")
      .eq("organization_id", org),
  ]);

  const supplierOptions = (suppliers ?? []).map((s) => ({ value: s.id, label: s.name }));
  const supplierName = new Map(supplierOptions.map((s) => [s.value, s.label]));
  const stockBy = new Map((stock ?? []).map((s) => [s.material_id, s]));
  const rows = (data ?? []).map((m) => ({
    ...(m as MaterialRow & { avg_cost: number }),
    stock: stockBy.get(m.id),
  }));

  const status = (r: (typeof rows)[number]) =>
    !r.active ? (
      <Pill tone="warning">Inativo</Pill>
    ) : r.stock?.below_min ? (
      <Pill tone="danger">Abaixo do mínimo</Pill>
    ) : (
      <Pill tone="success">OK</Pill>
    );

  return (
    <>
      <PageHeader
        title="Insumos"
        description="Matérias-primas usadas na produção: papel, chapas, vinil, tinta..."
        actions={canManage ? <MaterialFormDialog suppliers={supplierOptions} /> : undefined}
      />
      <ListSearch placeholder="Buscar por nome ou código" />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => !r.active}
        empty={q ? `Nenhum insumo encontrado para "${q}".` : "Nenhum insumo cadastrado ainda."}
        card={{
          title: (r) => r.name,
          subtitle: (r) =>
            [r.sku, r.supplier_id ? supplierName.get(r.supplier_id) : null]
              .filter(Boolean)
              .join(" · "),
          extra: (r) => (
            <>
              <Pill tone="secondary">
                {`Saldo: ${formatQuantity(r.stock?.available ?? 0, r.unit)}`}
              </Pill>
              <Pill>{`Custo: ${formatCurrency(r.avg_cost)}/${r.unit}`}</Pill>
              {status(r)}
            </>
          ),
        }}
        columns={[
          {
            header: "Insumo",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.sku ?? ""}</p>
              </div>
            ),
          },
          {
            header: "Disponível",
            cell: (r) => formatQuantity(r.stock?.available ?? 0, r.unit as Unit),
          },
          { header: "Mínimo", cell: (r) => formatQuantity(r.min_stock, r.unit as Unit) },
          {
            header: "Custo médio",
            cell: (r) => `${formatCurrency(r.avg_cost)}/${r.unit}`,
          },
          {
            header: "Fornecedor",
            cell: (r) => (r.supplier_id ? (supplierName.get(r.supplier_id) ?? "—") : "—"),
          },
          { header: "Situação", cell: status },
        ]}
        actions={
          canManage
            ? (r) => <MaterialFormDialog material={r} suppliers={supplierOptions} />
            : undefined
        }
      />
      <Pagination basePath="/cadastros/insumos" page={page} total={count ?? 0} q={q} />
    </>
  );
}

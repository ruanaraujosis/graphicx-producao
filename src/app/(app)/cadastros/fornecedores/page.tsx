import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDocument, formatPhone } from "@/lib/documents";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { SupplierFormDialog, type SupplierRow } from "./supplier-form";

export const metadata = { title: "Fornecedores" };

type Params = PageProps<"/cadastros/fornecedores">["searchParams"];

export default function FornecedoresPage({ searchParams }: PageProps<"/cadastros/fornecedores">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Fornecedores searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Fornecedores({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["cadastros.ver", "estoque.ver", "financeiro.ver"]);
  const canManage = can(membership.permissions, "cadastros.gerenciar");
  const { q, page, from, to } = parseListParams(await searchParams);

  const supabase = await createClient();
  let query = supabase
    .from("suppliers")
    .select(
      "id, name, legal_name, document, contact_name, email, phone, cep, street, number, complement, district, city, state, notes, active",
      { count: "exact" },
    )
    .eq("organization_id", membership.organizationId)
    .order("active", { ascending: false })
    .order("name")
    .range(from, to);
  if (q) {
    const term = ilikeTerm(q);
    query = query.or(`name.ilike.${term},legal_name.ilike.${term},contact_name.ilike.${term}`);
  }
  const { data, count } = await query;
  const rows = (data ?? []) as SupplierRow[];

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Quem vende insumos para a gráfica."
        actions={canManage ? <SupplierFormDialog /> : undefined}
      />
      <ListSearch placeholder="Buscar por nome, razão social ou contato" />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => !r.active}
        empty={
          q ? `Nenhum fornecedor encontrado para "${q}".` : "Nenhum fornecedor cadastrado ainda."
        }
        card={{
          title: (r) => r.name,
          subtitle: (r) =>
            [r.contact_name, formatPhone(r.phone)].filter(Boolean).join(" · ") || r.email,
          extra: (r) => (
            <>
              {r.document && <Pill>{formatDocument(r.document)}</Pill>}
              {r.city && <Pill>{`${r.city}/${r.state ?? ""}`}</Pill>}
              {!r.active && <Pill tone="warning">Inativo</Pill>}
            </>
          ),
        }}
        columns={[
          {
            header: "Fornecedor",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.legal_name ?? ""}</p>
              </div>
            ),
          },
          { header: "CNPJ/CPF", cell: (r) => formatDocument(r.document) || "—" },
          { header: "Contato", cell: (r) => r.contact_name ?? "—" },
          { header: "Telefone", cell: (r) => formatPhone(r.phone) || "—" },
          {
            header: "Status",
            cell: (r) =>
              r.active ? <Pill tone="success">Ativo</Pill> : <Pill tone="warning">Inativo</Pill>,
          },
        ]}
        actions={canManage ? (r) => <SupplierFormDialog supplier={r} /> : undefined}
      />
      <Pagination basePath="/cadastros/fornecedores" page={page} total={count ?? 0} q={q} />
    </>
  );
}

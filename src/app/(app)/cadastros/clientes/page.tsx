import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDocument, formatPhone } from "@/lib/documents";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { CustomerFormDialog, type CustomerRow } from "./customer-form";

export const metadata = { title: "Clientes" };

type Params = PageProps<"/cadastros/clientes">["searchParams"];

export default function ClientesPage({ searchParams }: PageProps<"/cadastros/clientes">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Clientes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Clientes({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg(["cadastros.ver", "pedidos.ver"]);
  const canManage = can(membership.permissions, ["cadastros.gerenciar", "pedidos.gerenciar"]);
  const { q, page, from, to } = parseListParams(await searchParams);

  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select(
      "id, person_type, name, legal_name, document, email, phone, whatsapp, origin, cep, street, number, complement, district, city, state, notes, active",
      { count: "exact" },
    )
    .eq("organization_id", membership.organizationId)
    .order("active", { ascending: false })
    .order("name")
    .range(from, to);
  if (q) {
    const term = ilikeTerm(q);
    const docDigits = q.replace(/\D/g, "");
    const filters = [`name.ilike.${term}`, `legal_name.ilike.${term}`, `email.ilike.${term}`];
    if (docDigits.length >= 3) {
      filters.push(`document.ilike.%${docDigits}%`, `whatsapp.ilike.%${docDigits}%`);
    }
    query = query.or(filters.join(","));
  }
  const { data, count } = await query;
  const rows = (data ?? []) as CustomerRow[];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas e empresas que compram da gráfica, de todos os canais."
        actions={canManage ? <CustomerFormDialog /> : undefined}
      />
      <ListSearch placeholder="Buscar por nome, CPF/CNPJ, e-mail ou WhatsApp" />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => !r.active}
        empty={q ? `Nenhum cliente encontrado para "${q}".` : "Nenhum cliente cadastrado ainda."}
        card={{
          title: (r) => r.name,
          subtitle: (r) =>
            [formatDocument(r.document), formatPhone(r.whatsapp ?? r.phone)]
              .filter(Boolean)
              .join(" · ") || r.email,
          extra: (r) => (
            <>
              <ChannelBadge channel={r.origin} />
              <Pill>{r.person_type === "pj" ? "PJ" : "PF"}</Pill>
              {r.city && <Pill>{`${r.city}/${r.state ?? ""}`}</Pill>}
              {!r.active && <Pill tone="warning">Inativo</Pill>}
            </>
          ),
        }}
        columns={[
          {
            header: "Cliente",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.email ?? r.legal_name ?? ""}
                </p>
              </div>
            ),
          },
          { header: "CPF/CNPJ", cell: (r) => formatDocument(r.document) || "—" },
          { header: "WhatsApp", cell: (r) => formatPhone(r.whatsapp ?? r.phone) || "—" },
          { header: "Cidade", cell: (r) => (r.city ? `${r.city}/${r.state ?? ""}` : "—") },
          { header: "Origem", cell: (r) => <ChannelBadge channel={r.origin} /> },
          {
            header: "Status",
            cell: (r) =>
              r.active ? <Pill tone="success">Ativo</Pill> : <Pill tone="warning">Inativo</Pill>,
          },
        ]}
        actions={canManage ? (r) => <CustomerFormDialog customer={r} /> : undefined}
      />
      <Pagination basePath="/cadastros/clientes" page={page} total={count ?? 0} q={q} />
    </>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pagination, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency } from "@/lib/format";
import { ilikeTerm, parseListParams } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { ProductFormDialog } from "./product-form";
import { FULFILLMENT_LABELS } from "./schema";

export const metadata = { title: "Produtos" };

type Params = PageProps<"/cadastros/produtos">["searchParams"];

export default function ProdutosPage({ searchParams }: PageProps<"/cadastros/produtos">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Produtos searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function priceRange(prices: number[]) {
  if (prices.length === 0) return "—";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
}

async function Produtos({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg("cadastros.ver");
  const canManage = can(membership.permissions, "cadastros.gerenciar");
  const { q, page, from, to } = parseListParams(await searchParams);
  const org = membership.organizationId;

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      "id, name, fulfillment, production_days, active, product_categories(name), product_variants(base_price, active)",
      { count: "exact" },
    )
    .eq("organization_id", org)
    .order("active", { ascending: false })
    .order("name")
    .range(from, to);
  if (q) query = query.ilike("name", ilikeTerm(q));
  const [{ data, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from("product_categories").select("id, name").eq("organization_id", org).order("name"),
  ]);

  const rows = (data ?? []).map((p) => {
    const active = p.product_variants.filter((v) => v.active);
    return {
      id: p.id,
      name: p.name,
      fulfillment: p.fulfillment,
      production_days: p.production_days,
      active: p.active,
      category: p.product_categories?.name ?? null,
      variants: active.length,
      prices: priceRange(active.map((v) => v.base_price)),
    };
  });
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));
  const link = (r: (typeof rows)[number]) => (
    <Link
      href={`/cadastros/produtos/${r.id}`}
      className="font-medium text-foreground hover:text-primary hover:underline"
    >
      {r.name}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo com variações, preços por canal, ficha técnica e fotos."
        actions={canManage ? <ProductFormDialog categories={categoryOptions} /> : undefined}
      />
      <ListSearch placeholder="Buscar produto pelo nome" />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => !r.active}
        empty={q ? `Nenhum produto encontrado para "${q}".` : "Nenhum produto cadastrado ainda."}
        card={{
          title: link,
          subtitle: (r) => r.category ?? "Sem categoria",
          extra: (r) => (
            <>
              <Pill tone="secondary">{FULFILLMENT_LABELS[r.fulfillment]}</Pill>
              <Pill>{`${r.variants} variação(ões)`}</Pill>
              <Pill>{r.prices}</Pill>
              {!r.active && <Pill tone="warning">Inativo</Pill>}
            </>
          ),
        }}
        columns={[
          { header: "Produto", cell: link },
          { header: "Categoria", cell: (r) => r.category ?? "—" },
          {
            header: "Produção",
            cell: (r) => <Pill tone="secondary">{FULFILLMENT_LABELS[r.fulfillment]}</Pill>,
          },
          { header: "Prazo", cell: (r) => `${r.production_days} dia(s)` },
          { header: "Variações", cell: (r) => r.variants },
          { header: "Preço base", cell: (r) => r.prices },
        ]}
      />
      <Pagination basePath="/cadastros/produtos" page={page} total={count ?? 0} q={q} />
    </>
  );
}

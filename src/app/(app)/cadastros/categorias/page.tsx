import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { CategoryFormDialog, DeleteCategoryButton } from "./category-form";

export const metadata = { title: "Categorias" };

export default function CategoriasPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Categorias />
      </Suspense>
    </div>
  );
}

async function Categorias() {
  const { membership } = await requireOrg("cadastros.ver");
  const canManage = can(membership.permissions, "cadastros.gerenciar");
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_categories")
    .select("id, name, products(count)")
    .eq("organization_id", membership.organizationId)
    .order("name");
  const rows = (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    products: c.products[0]?.count ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Agrupam os produtos no catálogo e nos relatórios."
        actions={canManage ? <CategoryFormDialog /> : undefined}
      />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nenhuma categoria ainda. Ex.: Chaveiros, Placas, Blocos de notas."
        card={{
          title: (r) => r.name,
          extra: (r) => <Pill>{`${r.products} produto(s)`}</Pill>,
        }}
        columns={[
          { header: "Categoria", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Produtos", cell: (r) => r.products },
        ]}
        actions={
          canManage
            ? (r) => (
                <div className="flex justify-end">
                  <DeleteCategoryButton category={r} products={r.products} />
                  <CategoryFormDialog category={r} />
                </div>
              )
            : undefined
        }
      />
    </>
  );
}

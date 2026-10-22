import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { requireOrg } from "@/lib/auth/dal";
import { formatPhone } from "@/lib/documents";
import { formatCurrency } from "@/lib/format";
import { formatQuantity, type Unit } from "@/lib/stock/units";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sugestão de compra" };

export default function ComprasPage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Insumos abaixo do estoque mínimo, agrupados pelo fornecedor padrão. A sugestão repõe até 2×
        o mínimo.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <Compras />
      </Suspense>
    </div>
  );
}

async function Compras() {
  const { membership } = await requireOrg("estoque.ver");
  const supabase = await createClient();
  const org = membership.organizationId;
  const [{ data: items }, { data: suppliers }] = await Promise.all([
    supabase
      .from("material_stock")
      .select(
        "material_id, name, unit, avg_cost, min_stock, available, suggested_purchase, supplier_id",
      )
      .eq("organization_id", org)
      .eq("active", true)
      .eq("below_min", true)
      .order("name"),
    supabase.from("suppliers").select("id, name, contact_name, phone").eq("organization_id", org),
  ]);
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s]));

  if (!items?.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhum insumo abaixo do mínimo. 🎉
      </div>
    );
  }

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.supplier_id ?? "__sem";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[...groups.entries()].map(([key, list]) => {
        const supplier = key === "__sem" ? null : supplierById.get(key);
        const total = list.reduce(
          (sum, i) => sum + Number(i.suggested_purchase) * Number(i.avg_cost),
          0,
        );
        return (
          <section
            key={key}
            className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-heading text-base font-semibold">
                  {supplier?.name ?? "Sem fornecedor padrão"}
                </h2>
                {supplier && (
                  <p className="text-xs text-muted-foreground">
                    {[supplier.contact_name, formatPhone(supplier.phone)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <Pill tone="accent">{`Estimado: ${formatCurrency(total)}`}</Pill>
            </div>
            <ul className="divide-y">
              {list.map((i) => (
                <li
                  key={i.material_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Disponível {formatQuantity(i.available, i.unit as Unit)} · mínimo{" "}
                      {formatQuantity(i.min_stock, i.unit as Unit)}
                    </p>
                  </div>
                  <Pill tone="danger">{`Comprar ${formatQuantity(i.suggested_purchase, i.unit as Unit)}`}</Pill>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

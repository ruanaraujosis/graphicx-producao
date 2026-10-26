import { AlertTriangle, Boxes, Wallet } from "lucide-react";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { StatCard } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { formatCurrency } from "@/lib/format";
import { formatQuantity, type Unit } from "@/lib/stock/units";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Estoque" };

export default function EstoquePage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Insumos />
    </Suspense>
  );
}

async function Insumos() {
  const { membership } = await requireOrg("estoque.ver");
  const supabase = await createClient();
  const { data } = await supabase
    .from("material_stock")
    .select(
      "material_id, name, unit, avg_cost, min_stock, on_hand, reserved, available, below_min, stock_value",
    )
    .eq("organization_id", membership.organizationId)
    .eq("active", true)
    .order("below_min", { ascending: false })
    .order("name");
  const rows = data ?? [];
  const belowMin = rows.filter((r) => r.below_min).length;
  const totalValue = rows.reduce((sum, r) => sum + Number(r.stock_value), 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Boxes} tone="teal" value={rows.length} label="Insumos ativos" />
        <StatCard
          icon={AlertTriangle}
          tone={belowMin ? "danger" : "success"}
          value={belowMin}
          label="Abaixo do mínimo"
        />
        <StatCard
          icon={Wallet}
          tone="primary"
          value={formatCurrency(totalValue)}
          label="Valor em estoque (custo médio)"
        />
      </div>

      <DataList
        rows={rows}
        rowKey={(r) => r.material_id}
        empty="Nenhum insumo cadastrado. Cadastre em Cadastros → Insumos e lance a primeira entrada."
        card={{
          title: (r) => r.name,
          subtitle: (r) => `Custo médio ${formatCurrency(r.avg_cost)}/${r.unit}`,
          extra: (r) => (
            <>
              <Pill tone={r.below_min ? "danger" : "secondary"}>
                {`Disponível: ${formatQuantity(r.available, r.unit as Unit)}`}
              </Pill>
              {r.reserved > 0 && (
                <Pill>{`Reservado: ${formatQuantity(r.reserved, r.unit as Unit)}`}</Pill>
              )}
              {r.min_stock > 0 && (
                <Pill>{`Mínimo: ${formatQuantity(r.min_stock, r.unit as Unit)}`}</Pill>
              )}
            </>
          ),
        }}
        columns={[
          { header: "Insumo", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Em estoque", cell: (r) => formatQuantity(r.on_hand, r.unit as Unit) },
          {
            header: "Reservado",
            cell: (r) => (r.reserved ? formatQuantity(r.reserved, r.unit as Unit) : "—"),
          },
          {
            header: "Disponível",
            cell: (r) => (
              <span className={r.below_min ? "font-semibold text-destructive" : "font-medium"}>
                {formatQuantity(r.available, r.unit as Unit)}
              </span>
            ),
          },
          {
            header: "Mínimo",
            cell: (r) => (r.min_stock ? formatQuantity(r.min_stock, r.unit as Unit) : "—"),
          },
          { header: "Custo médio", cell: (r) => `${formatCurrency(r.avg_cost)}/${r.unit}` },
          { header: "Valor", cell: (r) => formatCurrency(r.stock_value) },
          {
            header: "Situação",
            cell: (r) =>
              r.below_min ? <Pill tone="danger">Repor</Pill> : <Pill tone="success">OK</Pill>,
          },
        ]}
      />
    </>
  );
}

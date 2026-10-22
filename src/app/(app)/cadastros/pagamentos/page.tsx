import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { PaymentMethodFormDialog, type PaymentMethodRow } from "./payment-form";
import { PAYMENT_KIND_LABELS } from "./schema";

export const metadata = { title: "Formas de pagamento" };

const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

export default function PagamentosPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros" label="Cadastros" />
      <Suspense fallback={<ListSkeleton />}>
        <Pagamentos />
      </Suspense>
    </div>
  );
}

async function Pagamentos() {
  const { membership } = await requireOrg(["cadastros.ver", "financeiro.ver"]);
  const canManage = can(membership.permissions, ["cadastros.gerenciar", "financeiro.gerenciar"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("id, name, kind, fee_pct, settlement_days, active")
    .eq("organization_id", membership.organizationId)
    .order("active", { ascending: false })
    .order("name");
  const rows = (data ?? []) as PaymentMethodRow[];

  const terms = (r: PaymentMethodRow) =>
    `${pct.format(r.fee_pct)}% · ${r.settlement_days === 0 ? "na hora" : `${r.settlement_days} dias`}`;

  return (
    <>
      <PageHeader
        title="Formas de pagamento"
        description="Taxas e prazos de recebimento usados no financeiro e no cálculo de margem."
        actions={canManage ? <PaymentMethodFormDialog /> : undefined}
      />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        muted={(r) => !r.active}
        empty="Nenhuma forma de pagamento. Ex.: PIX (0%, na hora), Crédito (3,99%, 30 dias)."
        card={{
          title: (r) => r.name,
          subtitle: (r) => PAYMENT_KIND_LABELS[r.kind],
          extra: (r) => (
            <>
              <Pill tone="secondary">{terms(r)}</Pill>
              {!r.active && <Pill tone="warning">Inativa</Pill>}
            </>
          ),
        }}
        columns={[
          { header: "Nome", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Tipo", cell: (r) => PAYMENT_KIND_LABELS[r.kind] },
          { header: "Taxa", cell: (r) => `${pct.format(r.fee_pct)}%` },
          {
            header: "Recebimento",
            cell: (r) => (r.settlement_days === 0 ? "Na hora" : `${r.settlement_days} dias`),
          },
          {
            header: "Status",
            cell: (r) =>
              r.active ? <Pill tone="success">Ativa</Pill> : <Pill tone="warning">Inativa</Pill>,
          },
        ]}
        actions={canManage ? (r) => <PaymentMethodFormDialog method={r} /> : undefined}
      />
    </>
  );
}

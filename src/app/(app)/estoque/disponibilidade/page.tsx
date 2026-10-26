import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { requireOrg } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { FULFILLMENT_LABELS } from "../../cadastros/produtos/schema";

export const metadata = { title: "Disponibilidade" };

export default function DisponibilidadePage() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Quantas unidades de cada variação dá para entregar agora: peças prontas (só pronta-entrega)
        + quantas dá para produzir com os insumos, pela ficha técnica. É este número que vai para os
        marketplaces.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <Disponibilidade />
      </Suspense>
    </div>
  );
}

async function Disponibilidade() {
  const { membership } = await requireOrg("estoque.ver");
  const supabase = await createClient();
  const org = membership.organizationId;
  const [{ data: availability }, { data: variants }] = await Promise.all([
    supabase
      .from("variant_availability")
      .select(
        "variant_id, product_id, sku, fulfillment, ready_units, producible_units, bom_items, available_units",
      )
      .eq("organization_id", org)
      .order("available_units"),
    supabase
      .from("product_variants")
      .select("id, name, active, products(name, active)")
      .eq("organization_id", org),
  ]);
  const info = new Map((variants ?? []).map((v) => [v.id, v]));
  const rows = (availability ?? [])
    .filter((a) => info.get(a.variant_id)?.active && info.get(a.variant_id)?.products?.active)
    .map((a) => ({
      ...a,
      name: info.get(a.variant_id)?.name ?? "",
      product: info.get(a.variant_id)?.products?.name ?? "",
    }));

  const availabilityPill = (r: (typeof rows)[number]) =>
    r.bom_items === 0 && r.fulfillment === "sob_encomenda" ? (
      <Pill tone="warning">Sem ficha técnica</Pill>
    ) : r.available_units > 0 ? (
      <Pill tone="success">{`${r.available_units} un`}</Pill>
    ) : (
      <Pill tone="danger">Indisponível</Pill>
    );

  const productLink = (r: (typeof rows)[number]) => (
    <Link
      href={`/cadastros/produtos/${r.product_id}`}
      className="font-medium hover:text-primary hover:underline"
    >
      {r.product}
    </Link>
  );

  return (
    <DataList
      rows={rows}
      rowKey={(r) => r.variant_id}
      empty="Nenhuma variação ativa. Cadastre produtos em Cadastros → Produtos."
      card={{
        title: productLink,
        subtitle: (r) => `${r.sku} · ${r.name}`,
        extra: (r) => (
          <>
            {availabilityPill(r)}
            <Pill tone="secondary">{FULFILLMENT_LABELS[r.fulfillment]}</Pill>
            {r.fulfillment === "pronta_entrega" && <Pill>{`Prontas: ${r.ready_units}`}</Pill>}
            {r.producible_units !== null && <Pill>{`Produzíveis: ${r.producible_units}`}</Pill>}
          </>
        ),
      }}
      columns={[
        { header: "Produto", cell: productLink },
        {
          header: "Variação",
          cell: (r) => (
            <div className="min-w-0">
              <p className="truncate">{r.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{r.sku}</p>
            </div>
          ),
        },
        { header: "Produção", cell: (r) => FULFILLMENT_LABELS[r.fulfillment] },
        {
          header: "Prontas",
          cell: (r) => (r.fulfillment === "pronta_entrega" ? r.ready_units : "—"),
        },
        {
          header: "Produzíveis",
          cell: (r) => (r.producible_units === null ? "—" : r.producible_units),
        },
        { header: "Disponível", cell: availabilityPill },
      ]}
    />
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { DataList, Pill } from "@/components/kit/data-list";
import { ListSearch } from "@/components/kit/list-search";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { ilikeTerm } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { LinkPicker, ListingsToolbar } from "./listings-client";

export const metadata = { title: "Anúncios da Shopee" };

const FILTERS = [
  { value: "", label: "Todos" },
  { value: "sem-vinculo", label: "Sem vínculo" },
  { value: "com-erro", label: "Com erro" },
] as const;

type Props = PageProps<"/configuracoes/integracoes/[id]/anuncios">;

export default function AnunciosPage(props: Props) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes/integracoes" label="Integrações" />
      <Suspense fallback={<ListSkeleton />}>
        <Anuncios {...props} />
      </Suspense>
    </div>
  );
}

async function Anuncios({ params, searchParams }: Props) {
  const { membership } = await requireOrg("configuracoes.ver");
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const org = membership.organizationId;
  const filter = typeof raw.filtro === "string" ? raw.filtro : "";
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  const supabase = await createClient();

  const { data: shop } = await supabase
    .from("marketplace_shops")
    .select("id, name, external_shop_id, stock_ratio, price_sync_enabled")
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  if (!shop) notFound();

  let query = supabase
    .from("marketplace_listings")
    .select(
      "id, external_item_id, external_model_id, title, external_sku, status, external_price, external_stock, last_stock_sent, last_price_sent, last_synced_at, sync_error, variant_id, product_variants(sku, name, products(name))",
    )
    .eq("shop_id", shop.id)
    .neq("status", "excluido")
    .order("title")
    .limit(500);
  if (filter === "sem-vinculo") query = query.is("variant_id", null);
  if (filter === "com-erro") query = query.not("sync_error", "is", null);
  if (q) query = query.or(`title.ilike.${ilikeTerm(q)},external_sku.ilike.${ilikeTerm(q)}`);

  const [{ data: listings }, { data: variants }, { count: total }, { count: linked }] =
    await Promise.all([
      query,
      supabase
        .from("product_variants")
        .select("id, sku, name, products(name)")
        .eq("organization_id", org)
        .eq("active", true)
        .order("sku")
        .limit(2000),
      supabase
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .neq("status", "excluido"),
      supabase
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", shop.id)
        .neq("status", "excluido")
        .not("variant_id", "is", null),
    ]);

  const canLink = can(membership.permissions, "cadastros.gerenciar");
  const canManage = can(membership.permissions, "configuracoes.gerenciar");
  const options = (variants ?? []).map((v) => ({
    value: v.id,
    label: `${v.sku} — ${v.products?.name ?? ""} ${v.name}`.trim(),
    hint: v.products?.name ?? undefined,
  }));
  const rows = listings ?? [];
  const href = (f: string) => {
    const p = new URLSearchParams();
    if (f) p.set("filtro", f);
    if (q) p.set("q", q);
    const qs = p.toString();
    return `/configuracoes/integracoes/${shop.id}/anuncios${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={`Anúncios · ${shop.name ?? `Loja ${shop.external_shop_id}`}`}
        description={`${linked ?? 0} de ${total ?? 0} anúncios vinculados ao cadastro. Estoque enviado: ${Math.round(shop.stock_ratio * 100)}% da disponibilidade. ${shop.price_sync_enabled ? "Preços enviados pelo sistema." : "Preços não são enviados (ligue em Ajustes da loja)."}`}
        actions={canManage ? <ListingsToolbar shopId={shop.id} /> : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filtro" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(f.value)}
              aria-current={filter === f.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <ListSearch placeholder="Buscar por título ou SKU" />
      </div>

      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          total
            ? "Nenhum anúncio neste filtro."
            : "Nenhum anúncio importado ainda. Use “Importar anúncios”."
        }
        muted={(r) => r.status === "inativo"}
        columns={[
          {
            header: "Anúncio",
            cell: (r) => (
              <div className="min-w-0">
                <p className="max-w-80 truncate font-medium" title={r.title ?? ""}>
                  {r.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.external_sku ? `SKU ${r.external_sku}` : "Sem SKU"}
                  {r.status === "inativo" ? " · pausado" : ""}
                </p>
              </div>
            ),
          },
          {
            header: "Variação no cadastro",
            cell: (r) => (
              <LinkPicker
                listingId={r.id}
                canManage={canLink}
                variants={options}
                current={
                  r.product_variants
                    ? {
                        value: r.variant_id ?? "",
                        label:
                          `${r.product_variants.sku} — ${r.product_variants.products?.name ?? ""} ${r.product_variants.name}`.trim(),
                      }
                    : null
                }
              />
            ),
          },
          {
            header: "Estoque",
            className: "text-right",
            cell: (r) => (
              <span className="tabular-nums">
                {r.last_stock_sent ?? "—"}
                <span className="block text-xs text-muted-foreground">
                  na Shopee: {r.external_stock ?? "—"}
                </span>
              </span>
            ),
          },
          {
            header: "Preço",
            className: "text-right",
            cell: (r) => (
              <span className="tabular-nums">
                {r.external_price != null ? formatCurrency(r.external_price) : "—"}
                {r.last_price_sent != null && (
                  <span className="block text-xs text-muted-foreground">
                    enviado: {formatCurrency(r.last_price_sent)}
                  </span>
                )}
              </span>
            ),
          },
          {
            header: "Situação",
            cell: (r) => <Situation row={r} />,
          },
        ]}
        card={{
          title: (r) => r.title,
          subtitle: (r) => (r.external_sku ? `SKU ${r.external_sku}` : "Sem SKU"),
          extra: (r) => (
            <div className="flex w-full flex-col gap-2">
              <LinkPicker
                listingId={r.id}
                canManage={canLink}
                variants={options}
                current={
                  r.product_variants
                    ? {
                        value: r.variant_id ?? "",
                        label: `${r.product_variants.sku} — ${r.product_variants.name}`,
                      }
                    : null
                }
              />
              <div className="flex flex-wrap gap-1.5">
                <Pill>{`Estoque enviado: ${r.last_stock_sent ?? "—"}`}</Pill>
                {r.external_price != null && <Pill>{formatCurrency(r.external_price)}</Pill>}
              </div>
              <Situation row={r} />
            </div>
          ),
        }}
      />
      {rows.length === 500 && (
        <p className="text-center text-xs text-muted-foreground">
          Mostrando os primeiros 500. Use a busca para encontrar os demais.
        </p>
      )}
    </>
  );
}

function Situation({
  row,
}: {
  row: { variant_id: string | null; sync_error: string | null; last_synced_at: string | null };
}) {
  if (row.sync_error) return <p className="max-w-72 text-xs text-destructive">{row.sync_error}</p>;
  if (!row.variant_id) return <Pill tone="warning">Vincule para sincronizar</Pill>;
  return (
    <span className="text-xs text-muted-foreground">
      {row.last_synced_at
        ? `Sincronizado ${formatDateTime(row.last_synced_at)}`
        : "Aguardando envio"}
    </span>
  );
}

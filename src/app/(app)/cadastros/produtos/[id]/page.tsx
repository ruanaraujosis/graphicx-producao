import { ClipboardList, Pencil, Plus, Send, Tags } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import {
  CHANNEL_LABELS,
  SALES_CHANNELS,
  channelPrice,
  grossMarginPct,
  type SalesChannel,
} from "@/lib/catalog/pricing";
import { formatCurrency, formatPercent } from "@/lib/format";
import { bomUnitCost } from "@/lib/stock/cost";
import { UNIT_SHORT, formatQuantity, type Unit } from "@/lib/stock/units";
import { createClient } from "@/lib/supabase/server";
import { ProductFormDialog, type ProductRow } from "../product-form";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, FULFILLMENT_LABELS } from "../schema";
import { ProductImages } from "./product-images";
import {
  BomDialog,
  CopyBomDialog,
  VariantFormDialog,
  VariantPricesDialog,
  type MaterialOption,
  type VariantView,
} from "./variant-dialogs";

export const metadata = { title: "Produto" };

export default function ProdutoPage({ params }: PageProps<"/cadastros/produtos/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/cadastros/produtos" label="Produtos" />
      <Suspense fallback={<ListSkeleton />}>
        <Produto params={params} />
      </Suspense>
    </div>
  );
}

function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

async function Produto({ params }: { params: PageProps<"/cadastros/produtos/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { membership } = await requireOrg("cadastros.ver");
  const canManage = can(membership.permissions, "cadastros.gerenciar");
  const org = membership.organizationId;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name, category_id, fulfillment, production_days, description, ncm, cest, cfop, active, product_categories(name)",
    )
    .eq("id", id)
    .eq("organization_id", org)
    .maybeSingle();
  if (!product) notFound();

  const [variantsRes, rulesRes, materialsRes, categoriesRes, imagesRes, availabilityRes] =
    await Promise.all([
      supabase
        .from("product_variants")
        .select(
          "id, sku, name, attributes, base_price, weight_g, length_cm, width_cm, height_cm, active, variant_channel_prices(channel, price), bom_items(material_id, quantity, waste_pct)",
        )
        .eq("product_id", id)
        .order("active", { ascending: false })
        .order("sku"),
      supabase
        .from("channel_price_rules")
        .select("channel, adjustment_pct")
        .eq("organization_id", org),
      supabase
        .from("materials")
        .select("id, name, unit, avg_cost")
        .eq("organization_id", org)
        .eq("active", true)
        .order("name"),
      supabase
        .from("product_categories")
        .select("id, name")
        .eq("organization_id", org)
        .order("name"),
      supabase
        .from("product_images")
        .select("id, storage_path")
        .eq("product_id", id)
        .order("position"),
      supabase
        .from("variant_availability")
        .select("variant_id, available_units, producible_units, ready_units")
        .eq("product_id", id),
    ]);

  const rules = Object.fromEntries(SALES_CHANNELS.map((c) => [c, 0])) as Record<
    SalesChannel,
    number
  >;
  for (const r of rulesRes.data ?? []) rules[r.channel] = r.adjustment_pct;

  const materials = (materialsRes.data ?? []) as MaterialOption[];
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const availability = new Map((availabilityRes.data ?? []).map((a) => [a.variant_id, a]));

  const variants: VariantView[] = (variantsRes.data ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    attributes: (v.attributes ?? {}) as Record<string, string>,
    base_price: v.base_price,
    weight_g: v.weight_g,
    length_cm: v.length_cm,
    width_cm: v.width_cm,
    height_cm: v.height_cm,
    active: v.active,
    overrides: Object.fromEntries(v.variant_channel_prices.map((p) => [p.channel, p.price])),
    bom: v.bom_items,
  }));

  const paths = (imagesRes.data ?? []).map((i) => i.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from("produtos").createSignedUrls(paths, 60 * 60)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const images = (imagesRes.data ?? []).map((i) => ({
    id: i.id,
    url: urlByPath.get(i.storage_path) ?? null,
  }));

  // Shopee: lojas conectadas, publicações deste produto e anúncios já vinculados.
  const variantIds = variants.map((v) => v.id);
  const [shopsRes, pubsRes, linkedRes] = await Promise.all([
    supabase
      .from("marketplace_shops")
      .select("id, name, external_shop_id, status")
      .eq("organization_id", org)
      .neq("status", "desconectada")
      .order("created_at"),
    supabase
      .from("marketplace_publications")
      .select("shop_id, status, error, external_item_id")
      .eq("product_id", id),
    variantIds.length
      ? supabase
          .from("marketplace_listings")
          .select("shop_id, external_item_id")
          .in("variant_id", variantIds)
          .neq("status", "excluido")
      : Promise.resolve({ data: [] as { shop_id: string; external_item_id: string }[] }),
  ]);
  const shops = (shopsRes.data ?? []).map((sh) => ({
    ...sh,
    publication: (pubsRes.data ?? []).find((p) => p.shop_id === sh.id) ?? null,
    linkedItems: [
      ...new Set(
        (linkedRes.data ?? []).filter((l) => l.shop_id === sh.id).map((l) => l.external_item_id),
      ),
    ],
  }));

  const categoryOptions = (categoriesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const productRow: ProductRow = {
    id: product.id,
    name: product.name,
    category_id: product.category_id,
    fulfillment: product.fulfillment,
    production_days: product.production_days,
    description: product.description,
    ncm: product.ncm,
    cest: product.cest,
    cfop: product.cfop,
    active: product.active,
  };

  return (
    <>
      <PageHeader
        title={product.name}
        description={[
          product.product_categories?.name ?? "Sem categoria",
          FULFILLMENT_LABELS[product.fulfillment],
          `${product.production_days} dia(s) de produção`,
        ].join(" · ")}
        actions={
          canManage ? (
            <ProductFormDialog product={productRow} categories={categoryOptions} />
          ) : undefined
        }
      />
      {!product.active && <Pill tone="warning">Produto inativo</Pill>}

      <Section
        title="Variações"
        description="Cada combinação vendida (tamanho, espessura, cor, acabamento) com SKU e preço."
        actions={
          canManage && (
            <VariantFormDialog
              productId={product.id}
              trigger={
                <Button>
                  <Plus />
                  Nova variação
                </Button>
              }
            />
          )
        }
      >
        {variants.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma variação ainda. Toda venda é de uma variação (mesmo que o produto tenha uma só).
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {variants.map((v) => {
              const cost = bomUnitCost(
                v.bom.flatMap((b) => {
                  const m = materialById.get(b.material_id);
                  return m
                    ? [{ quantity: b.quantity, wastePct: b.waste_pct, avgCost: m.avg_cost }]
                    : [];
                }),
              );
              const margin = grossMarginPct(
                channelPrice({
                  basePrice: v.base_price,
                  adjustmentPct: rules.balcao,
                  override: v.overrides.balcao,
                }),
                cost,
              );
              const avail = availability.get(v.id);
              const siblings = variants
                .filter((s) => s.id !== v.id)
                .map((s) => ({ id: s.id, sku: s.sku, name: s.name }));
              return (
                <li
                  key={v.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 ${v.active ? "" : "opacity-70"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{v.sku}</p>
                    </div>
                    {canManage && (
                      <VariantFormDialog
                        productId={product.id}
                        variant={v}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Editar ${v.sku}`}>
                            <Pencil />
                          </Button>
                        }
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {ATTRIBUTE_KEYS.filter((k) => v.attributes[k]).map((k) => (
                      <Pill key={k}>{`${ATTRIBUTE_LABELS[k]}: ${v.attributes[k]}`}</Pill>
                    ))}
                    {!v.active && <Pill tone="warning">Inativa</Pill>}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    {SALES_CHANNELS.map((c) => {
                      const price = channelPrice({
                        basePrice: v.base_price,
                        adjustmentPct: rules[c],
                        override: v.overrides[c],
                      });
                      return (
                        <div key={c}>
                          <dt className="text-xs text-muted-foreground">
                            {CHANNEL_LABELS[c]}
                            {v.overrides[c] !== undefined && " · manual"}
                          </dt>
                          <dd className="font-medium">{formatCurrency(price)}</dd>
                        </div>
                      );
                    })}
                  </dl>

                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone={v.bom.length ? "secondary" : "warning"}>
                      {v.bom.length
                        ? `Custo insumos: ${formatCurrency(cost)}`
                        : "Sem ficha técnica"}
                    </Pill>
                    {v.bom.length > 0 && (
                      <Pill tone="success">{`Margem balcão: ${margin === null ? "—" : formatPercent(margin)}`}</Pill>
                    )}
                    {avail && (
                      <Pill tone={avail.available_units > 0 ? "info" : "danger"}>
                        {`Disponível: ${avail.available_units} un`}
                      </Pill>
                    )}
                  </div>

                  {v.bom.length > 0 && (
                    <ul className="flex flex-col gap-0.5 rounded-xl bg-muted/60 p-3 text-xs">
                      {v.bom.map((b) => {
                        const m = materialById.get(b.material_id);
                        return (
                          <li key={b.material_id} className="flex justify-between gap-2">
                            <span className="truncate">{m?.name ?? "Insumo inativo"}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatQuantity(b.quantity, m?.unit as Unit | undefined)}
                              {b.waste_pct > 0 && ` +${formatPercent(b.waste_pct)}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {canManage && (
                    <div className="flex flex-wrap gap-1">
                      <VariantPricesDialog
                        variant={v}
                        rules={rules}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Tags />
                            Preços
                          </Button>
                        }
                      />
                      <BomDialog
                        variant={v}
                        materials={materials}
                        trigger={
                          <Button variant="outline" size="sm">
                            <ClipboardList />
                            Ficha técnica
                          </Button>
                        }
                      />
                      <CopyBomDialog from={v} siblings={siblings} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Fotos"
        description="Usadas no catálogo e, depois, nos anúncios dos marketplaces."
      >
        <ProductImages
          organizationId={org}
          productId={product.id}
          images={images}
          canManage={canManage}
        />
      </Section>

      <Section
        title="Shopee"
        description="Publique este produto como anúncio novo ou acompanhe os anúncios vinculados."
      >
        {shops.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma loja conectada. Conecte em Configurações → Integrações.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {shops.map((sh) => {
              const pub = sh.publication;
              const linked = sh.linkedItems.length > 0;
              const canPublish =
                canManage && sh.status === "conectada" && !linked && pub?.status !== "na_fila";
              return (
                <li key={sh.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{sh.name ?? `Loja ${sh.external_shop_id}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {linked
                        ? `Vinculado ao anúncio ${sh.linkedItems.join(", ")}`
                        : pub?.status === "na_fila"
                          ? "Publicando…"
                          : pub?.status === "rascunho"
                            ? "Rascunho salvo, ainda não publicado"
                            : "Ainda não está à venda nesta loja"}
                    </p>
                    {pub?.status === "erro" && pub.error && (
                      <p className="mt-1 text-xs text-destructive">{pub.error}</p>
                    )}
                  </div>
                  {linked ? (
                    <Pill tone="success">
                      {pub?.status === "publicado" ? "Publicado" : "Vinculado"}
                    </Pill>
                  ) : (
                    canPublish && (
                      <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-8">
                        <Link href={`/cadastros/produtos/${product.id}/shopee/${sh.id}`}>
                          <Send />
                          {pub ? "Revisar e publicar" : "Publicar na Shopee"}
                        </Link>
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Dados fiscais" description="Usados na emissão de NF-e.">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          {[
            ["NCM", product.ncm],
            ["CEST", product.cest],
            ["CFOP padrão", product.cfop],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {product.description && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{product.description}</p>
        )}
      </Section>

      {materials.length === 0 && canManage && (
        <p className="text-sm text-muted-foreground">
          Dica: cadastre os insumos em Cadastros → Insumos para montar a ficha técnica (
          {UNIT_SHORT.un}, folha, m²...).
        </p>
      )}
    </>
  );
}

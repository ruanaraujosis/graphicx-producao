import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { channelPrice } from "@/lib/catalog/pricing";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { getLogisticsChannels, type LogisticsChannel } from "@/lib/marketplaces/shopee/publish";
import { admin, loadShop, logger, shopCredentials } from "@/lib/marketplaces/store";
import { createClient } from "@/lib/supabase/server";
import { PublishForm } from "./publish-form";
import type { PublicationInput } from "./schema";

export const metadata = { title: "Publicar na Shopee" };

type Props = PageProps<"/cadastros/produtos/[id]/shopee/[shopId]">;

/** Categorias com mais de 7 dias são atualizadas em segundo plano. */
const CATEGORIES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export default function PublicarPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<ListSkeleton />}>
        <Publicar params={params} />
      </Suspense>
    </div>
  );
}

/** Põe a atualização das categorias na fila quando faltam ou passaram de 7 dias. */
async function refreshCategoriesIfStale(shopId: string, oldestUpdatedAt: string | null) {
  const oldest = oldestUpdatedAt ? new Date(oldestUpdatedAt).getTime() : 0;
  if (Date.now() - oldest <= CATEGORIES_MAX_AGE_MS) return;
  await admin().rpc("marketplace_enqueue", {
    p_shop: shopId,
    p_kind: "categories.sync",
    p_dedupe: "categories.sync",
  });
}

async function Publicar({ params }: { params: Props["params"] }) {
  const { id, shopId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(shopId)) notFound();
  const { membership } = await requireOrg("cadastros.gerenciar");
  const org = membership.organizationId;
  const supabase = await createClient();

  const [{ data: product }, { data: shop }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, fulfillment, production_days, active")
      .eq("id", id)
      .eq("organization_id", org)
      .maybeSingle(),
    supabase
      .from("marketplace_shops")
      .select("id, name, external_shop_id, status, stock_ratio")
      .eq("id", shopId)
      .eq("organization_id", org)
      .maybeSingle(),
  ]);
  if (!product || !shop) notFound();

  const back = <BackLink href={`/cadastros/produtos/${product.id}`} label={product.name} />;
  const shopName = shop.name ?? `Loja ${shop.external_shop_id}`;
  const config = getShopeeConfig();
  if (!config || shop.status !== "conectada") {
    return (
      <>
        {back}
        <PageHeader title="Publicar na Shopee" description={shopName} />
        <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          {config
            ? "A loja precisa estar conectada. Reconecte em Configurações → Integrações."
            : "A integração com a Shopee ainda não está ativa."}
        </p>
      </>
    );
  }

  const [pubRes, variantsRes, rulesRes, availRes, imagesRes, catRes] = await Promise.all([
    supabase
      .from("marketplace_publications")
      .select(
        "id, title, description, category_id, category_path, attributes, logistics, item_status, status, external_item_id, error, published_at",
      )
      .eq("shop_id", shop.id)
      .eq("product_id", product.id)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("id, sku, name, base_price, weight_g, variant_channel_prices(channel, price)")
      .eq("product_id", product.id)
      .eq("active", true)
      .order("sku"),
    supabase
      .from("channel_price_rules")
      .select("adjustment_pct")
      .eq("organization_id", org)
      .eq("channel", "shopee")
      .maybeSingle(),
    supabase
      .from("variant_availability")
      .select("variant_id, available_units, bom_items")
      .eq("product_id", product.id),
    supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id),
    supabase
      .from("marketplace_categories")
      .select("updated_at")
      .eq("marketplace", "shopee")
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const pub = pubRes.data;

  if (pub?.status === "publicado" || pub?.status === "na_fila") {
    const done = pub.status === "publicado";
    return (
      <>
        {back}
        <PageHeader title="Publicar na Shopee" description={shopName} />
        <p className="flex items-center gap-2 rounded-2xl border bg-card px-5 py-4 text-sm">
          {done ? (
            <CheckCircle2 className="size-4 text-success" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {done
            ? `Publicado ${pub.published_at ? formatDateTime(pub.published_at) : ""} · anúncio ${pub.external_item_id}. Estoque, preço e prazo seguem sincronizados.`
            : "Publicando… atualize a página em instantes."}
        </p>
        <Button asChild variant="outline" className="min-h-11 self-start">
          <Link href={`/configuracoes/integracoes/${shop.id}/anuncios`}>Ver anúncios da loja</Link>
        </Button>
      </>
    );
  }

  // Categorias da Shopee: busca na primeira vez e atualiza se estiverem velhas.
  const categoriesMissing = !catRes.data;
  await refreshCategoriesIfStale(shop.id, catRes.data?.updated_at ?? null);

  let logistics: LogisticsChannel[] = [];
  let logisticsError: string | null = null;
  try {
    const row = await loadShop(shop.id);
    if (row) {
      logistics = await getLogisticsChannels(config, await shopCredentials(row), {
        onLog: logger(row),
      });
    }
  } catch (e) {
    logisticsError = `Não foi possível carregar as formas de envio: ${e instanceof Error ? e.message : "erro"}`;
  }

  const adjust = rulesRes.data?.adjustment_pct ?? 0;
  const avail = new Map((availRes.data ?? []).map((a) => [a.variant_id, a]));
  const variants = (variantsRes.data ?? []).map((v) => {
    const a = avail.get(v.id);
    const override = v.variant_channel_prices.find((p) => p.channel === "shopee")?.price;
    return {
      sku: v.sku,
      name: v.name,
      weight_g: v.weight_g,
      price: channelPrice({ basePrice: v.base_price, adjustmentPct: adjust, override }),
      stock:
        product.fulfillment === "sob_encomenda" && !a?.bom_items
          ? null
          : Math.floor((a?.available_units ?? 0) * shop.stock_ratio),
    };
  });

  const initial: PublicationInput = {
    title: pub?.title ?? product.name.slice(0, 120),
    description: pub?.description ?? product.description ?? "",
    category_id: pub?.category_id ?? null,
    category_path: pub?.category_path ?? null,
    attributes: (pub?.attributes ?? []) as PublicationInput["attributes"],
    logistics: (pub?.logistics ?? []) as number[],
    item_status: (pub?.item_status as PublicationInput["item_status"]) ?? "NORMAL",
  };

  return (
    <>
      {back}
      <PageHeader
        title="Publicar na Shopee"
        description={`${product.name} → ${shopName}. Preço do canal Shopee, estoque com ${Math.round(shop.stock_ratio * 100)}% da disponibilidade e prazo de ${product.production_days} dia(s).`}
      />
      {pub?.status === "erro" && pub.error && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />A última tentativa falhou:{" "}
          {pub.error}
        </p>
      )}
      {categoriesMissing && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Buscando as categorias da Shopee pela primeira vez. Atualize a página em um minuto.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Variações que vão para o anúncio</h2>
        <ul className="flex flex-col divide-y text-sm">
          {variants.map((v) => (
            <li key={v.sku} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-xs">{v.sku}</span> · {v.name}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatCurrency(v.price)} · estoque {v.stock ?? "—"} ·{" "}
                {v.weight_g ? `${v.weight_g} g` : "sem peso"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <PublishForm
        productId={product.id}
        shopId={shop.id}
        initial={initial}
        logistics={logistics}
        logisticsError={logisticsError}
        check={{ images: imagesRes.count ?? 0, productActive: product.active, variants }}
      />
    </>
  );
}

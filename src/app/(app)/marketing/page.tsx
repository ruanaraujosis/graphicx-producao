import Link from "next/link";
import { Suspense } from "react";
import { cn } from "cn";
import { ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_REPLY_TEMPLATES } from "@/lib/marketplaces/replies";
import { createClient } from "@/lib/supabase/server";
import {
  AddBoostItem,
  BoostRowActions,
  CustomizeDefaultsButton,
  DeleteTemplateButton,
  MarketingSettings,
  ReviewReply,
  Stars,
  SyncReviewsButton,
  TemplateDialog,
} from "./marketing-client";

export const metadata = { title: "Marketing" };

const TABS = [
  { value: "avaliacoes", label: "Avaliações" },
  { value: "impulsionamento", label: "Impulsionamento" },
  { value: "modelos", label: "Modelos de resposta" },
] as const;

const REVIEW_FILTERS = [
  { value: "pendentes", label: "Aguardando revisão" },
  { value: "respondidas", label: "Respondidas" },
  { value: "todas", label: "Todas" },
] as const;

const STATUS_LABEL: Record<
  string,
  { label: string; tone: "warning" | "success" | "muted" | "danger" | "info" }
> = {
  pendente: { label: "Aguardando revisão", tone: "warning" },
  enviando: { label: "Enviando", tone: "info" },
  respondida: { label: "Respondida", tone: "success" },
  ignorada: { label: "Ignorada", tone: "muted" },
  erro: { label: "Erro ao enviar", tone: "danger" },
};

type Search = PageProps<"/marketing">["searchParams"];

export default function MarketingPage({ searchParams }: PageProps<"/marketing">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description="Impulsionamento automático dos anúncios e respostas às avaliações da Shopee."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Marketing searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function pillLink(active: boolean) {
  return cn(
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm md:min-h-9",
    active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
  );
}

async function Marketing({ searchParams }: { searchParams: Search }) {
  const { membership } = await requireOrg("marketing.ver");
  const org = membership.organizationId;
  const canManage = can(membership.permissions, "marketing.gerenciar");
  const raw = await searchParams;
  const tab = TABS.find((t) => t.value === raw.aba)?.value ?? "avaliacoes";
  const supabase = await createClient();

  const { data: shops } = await supabase
    .from("marketplace_shops")
    .select(
      "id, name, external_shop_id, status, boost_enabled, last_boost_at, review_auto_reply, review_signature, reviews_synced_at",
    )
    .eq("organization_id", org)
    .neq("status", "desconectada")
    .order("created_at");
  const list = shops ?? [];
  const shop = list.find((s) => s.id === raw.loja) ?? list[0];

  const href = (params: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { loja: shop?.id, aba: tab, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/marketing?${p}`;
  };

  if (tab !== "modelos" && !shop) {
    return (
      <>
        <Tabs current={tab} href={href} />
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma loja da Shopee conectada. Conecte em Configurações → Integrações.
        </p>
      </>
    );
  }

  return (
    <>
      <Tabs current={tab} href={href} />
      {list.length > 1 && tab !== "modelos" && (
        <nav aria-label="Loja" className="flex flex-wrap gap-2">
          {list.map((s) => (
            <Link key={s.id} href={href({ loja: s.id })} className={pillLink(s.id === shop?.id)}>
              {s.name ?? `Loja ${s.external_shop_id}`}
            </Link>
          ))}
        </nav>
      )}
      {tab === "avaliacoes" && shop && (
        <Reviews
          shop={shop}
          filter={typeof raw.filtro === "string" ? raw.filtro : "pendentes"}
          href={href}
          canManage={canManage}
        />
      )}
      {tab === "impulsionamento" && shop && <Boost shop={shop} canManage={canManage} />}
      {tab === "modelos" && <Templates org={org} canManage={canManage} />}
    </>
  );
}

function Tabs({
  current,
  href,
}: {
  current: string;
  href: (p: Record<string, string | undefined>) => string;
}) {
  return (
    <nav aria-label="Seções" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={href({ aba: t.value, filtro: undefined })}
          aria-current={current === t.value ? "page" : undefined}
          className={pillLink(current === t.value)}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

type Shop = {
  id: string;
  name: string | null;
  boost_enabled: boolean;
  last_boost_at: string | null;
  review_auto_reply: boolean;
  review_signature: string | null;
  reviews_synced_at: string | null;
};

async function Reviews({
  shop,
  filter,
  href,
  canManage,
}: {
  shop: Shop;
  filter: string;
  href: (p: Record<string, string | undefined>) => string;
  canManage: boolean;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("marketplace_reviews")
    .select(
      "id, rating, comment, buyer_name, item_title, commented_at, reply_text, status, auto, error",
    )
    .eq("shop_id", shop.id)
    .order("commented_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (filter === "pendentes") query = query.in("status", ["pendente", "erro"]);
  if (filter === "respondidas") query = query.in("status", ["respondida", "enviando"]);
  const { data: reviews } = await query;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Filtro" className="flex flex-wrap gap-2">
            {REVIEW_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={href({ filtro: f.value })}
                className={pillLink(filter === f.value)}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          {canManage && <SyncReviewsButton shopId={shop.id} />}
        </div>
        <p className="text-xs text-muted-foreground">
          {shop.reviews_synced_at
            ? `Avaliações conferidas ${formatDateTime(shop.reviews_synced_at)} (a cada hora).`
            : "As avaliações são trazidas da Shopee a cada hora."}
        </p>
        {(reviews ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            {filter === "pendentes"
              ? "Nenhuma avaliação esperando revisão. 🎉"
              : "Nenhuma avaliação aqui."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(reviews ?? []).map((r) => {
              const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.pendente;
              const editable = canManage && (r.status === "pendente" || r.status === "erro");
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} />
                    <span className="text-sm font-medium">{r.buyer_name ?? "Comprador"}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.commented_at ? formatDateTime(r.commented_at) : ""}
                    </span>
                    <span className="ml-auto flex gap-1.5">
                      {r.auto && <Pill tone="info">Automática</Pill>}
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </span>
                  </div>
                  {r.item_title && <p className="text-xs text-muted-foreground">{r.item_title}</p>}
                  <p className="text-sm whitespace-pre-line">
                    {r.comment || "(sem comentário, só a nota)"}
                  </p>
                  {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                  <ReviewReply reviewId={r.id} initial={r.reply_text ?? ""} editable={editable} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <aside>
        <MarketingSettings
          shopId={shop.id}
          canManage={canManage}
          initial={{
            boost_enabled: shop.boost_enabled,
            review_auto_reply: shop.review_auto_reply,
            review_signature: shop.review_signature ?? "",
          }}
        />
      </aside>
    </div>
  );
}

async function Boost({ shop, canManage }: { shop: Shop; canManage: boolean }) {
  const supabase = await createClient();
  const [{ data: items }, { data: listings }] = await Promise.all([
    supabase
      .from("marketplace_boost_items")
      .select("id, external_item_id, title, position, active, last_boosted_at, last_error")
      .eq("shop_id", shop.id)
      .order("position"),
    supabase
      .from("marketplace_listings")
      .select("external_item_id, title")
      .eq("shop_id", shop.id)
      .eq("status", "ativo")
      .order("title")
      .limit(2000),
  ]);
  const inList = new Set((items ?? []).map((i) => i.external_item_id));
  // Um anúncio por item (as variações vêm como "Título — Opção").
  const options = [
    ...new Map(
      (listings ?? [])
        .filter((l) => !inList.has(l.external_item_id))
        .map((l) => [
          l.external_item_id,
          { value: l.external_item_id, label: (l.title ?? "").split(" — ")[0] },
        ]),
    ).values(),
  ];
  const rows = items ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          A cada 4 horas, os 5 primeiros anúncios ativos e com estoque são impulsionados, em rodízio
          pela ordem da lista.{" "}
          {shop.boost_enabled
            ? shop.last_boost_at
              ? `Última rodada ${formatDateTime(shop.last_boost_at)}.`
              : "A primeira rodada sai em instantes."
            : "O impulsionamento está desligado nos ajustes."}
        </p>
        {canManage && <AddBoostItem shopId={shop.id} options={options} />}
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            A lista está vazia. Adicione os anúncios que quer impulsionar.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.map((it, i) => (
              <li
                key={it.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm",
                  !it.active && "opacity-60",
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {it.title ?? `Anúncio ${it.external_item_id}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.last_boosted_at
                      ? `Impulsionado ${formatDateTime(it.last_boosted_at)}`
                      : "Ainda não impulsionado"}
                    {it.active ? "" : " · pausado"}
                  </p>
                  {it.last_error && <p className="text-xs text-destructive">{it.last_error}</p>}
                </div>
                {canManage && (
                  <BoostRowActions
                    id={it.id}
                    active={it.active}
                    first={i === 0}
                    last={i === rows.length - 1}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <aside>
        <MarketingSettings
          shopId={shop.id}
          canManage={canManage}
          initial={{
            boost_enabled: shop.boost_enabled,
            review_auto_reply: shop.review_auto_reply,
            review_signature: shop.review_signature ?? "",
          }}
        />
      </aside>
    </div>
  );
}

async function Templates({ org, canManage }: { org: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_reply_templates")
    .select("id, min_stars, max_stars, body, active")
    .eq("organization_id", org)
    .order("max_stars", { ascending: false })
    .order("min_stars", { ascending: false });
  const own = data ?? [];
  const band = (min: number, max: number) =>
    min === max ? `${min} estrela${min > 1 ? "s" : ""}` : `${min} a ${max} estrelas`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Respostas prontas por faixa de estrelas. Use {"{comprador}"}, {"{produto}"} e {"{loja}"}.
          Com mais de um modelo na mesma faixa, o sistema alterna entre eles.
        </p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {own.length === 0 && <CustomizeDefaultsButton />}
            <TemplateDialog />
          </div>
        )}
      </div>
      {own.length === 0 && (
        <p className="text-sm font-medium">Usando os modelos padrão do GraphicX:</p>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {(own.length
          ? own
          : DEFAULT_REPLY_TEMPLATES.map((t, i) => ({ ...t, id: `padrao-${i}`, active: true }))
        ).map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Stars rating={t.max_stars} />
              <span className="text-sm font-medium">{band(t.min_stars, t.max_stars)}</span>
              {t.max_stars <= 3 && <Pill tone="warning">Revisão</Pill>}
              {canManage && own.length > 0 && (
                <span className="ml-auto flex">
                  <TemplateDialog template={t} />
                  <DeleteTemplateButton id={t.id} />
                </span>
              )}
            </div>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{t.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

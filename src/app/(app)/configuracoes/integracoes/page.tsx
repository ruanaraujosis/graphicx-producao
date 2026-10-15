import { AlertTriangle, CheckCircle2, ListChecks, PlugZap, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { IconChip } from "@/components/kit/stat-card";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { createClient } from "@/lib/supabase/server";
import { ShopActions } from "./integrations-client";

export const metadata = { title: "Integrações" };

const ERRORS: Record<string, string> = {
  config: "A conexão com a Shopee ainda não foi ativada na GraphicX. Fale com o suporte.",
  estado: "A autorização expirou ou veio de outra sessão. Tente conectar de novo.",
  autorizacao: "A Shopee não confirmou a autorização. Tente de novo.",
  "outra-grafica": "Esta loja já está conectada a outra gráfica na GraphicX.",
  salvar: "Não foi possível salvar a loja. Tente de novo.",
};

const STATUS = {
  conectada: { label: "Conectada", tone: "success" },
  expirada: { label: "Autorização expirada", tone: "danger" },
  desconectada: { label: "Desconectada", tone: "muted" },
} as const;

type Params = PageProps<"/configuracoes/integracoes">["searchParams"];

export default function IntegracoesPage({ searchParams }: PageProps<"/configuracoes/integracoes">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes" label="Configurações" />
      <Suspense fallback={<ListSkeleton />}>
        <Integracoes searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Integracoes({ searchParams }: { searchParams: Params }) {
  const { membership } = await requireOrg("configuracoes.ver");
  const raw = await searchParams;
  const org = membership.organizationId;
  const canManage = membership.permissions.includes("configuracoes.gerenciar");
  const shopeeReady = getShopeeConfig() !== null;
  const supabase = await createClient();

  const [{ data: shops }, { data: jobs }, { data: logs }, { data: listings }] = await Promise.all([
    supabase
      .from("marketplace_shops")
      .select(
        "id, marketplace, external_shop_id, name, region, status, stock_ratio, price_sync_enabled, ship_mode, chat_message_enabled, chat_template, last_sync_at, last_error, access_expires_at",
      )
      .eq("organization_id", org)
      .order("created_at"),
    supabase
      .from("marketplace_jobs")
      .select("shop_id, status, kind, last_error, updated_at")
      .eq("organization_id", org)
      .in("status", ["pendente", "processando", "erro"])
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("marketplace_logs")
      .select("shop_id, endpoint, ok, error, created_at, direction")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("marketplace_listings")
      .select("shop_id, variant_id")
      .eq("organization_id", org)
      .neq("status", "excluido")
      .limit(10000),
  ]);
  const list = shops ?? [];
  const errorMessage = typeof raw.erro === "string" ? ERRORS[raw.erro] : undefined;

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conecte as lojas da Shopee: pedidos entram sozinhos e estoque e preços são enviados pelo sistema."
      />

      {raw.conectada === "1" && (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          Loja conectada! Os anúncios e os pedidos recentes estão sendo trazidos.
        </p>
      )}
      {errorMessage && (
        <p className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
          {errorMessage}
        </p>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <IconChip icon={Store} tone="warning" />
            <div>
              <p className="font-semibold">Shopee</p>
              <p className="text-xs text-muted-foreground">Pedidos, estoque, preços, etiquetas</p>
            </div>
          </div>
          {canManage &&
            (shopeeReady ? (
              <Button asChild>
                {/* Link comum: a rota redireciona para a página de autorização da Shopee. */}
                <a href="/api/marketplaces/shopee/connect">
                  <PlugZap />
                  Conectar loja da Shopee
                </a>
              </Button>
            ) : (
              <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                A conexão com a Shopee será liberada em breve.
              </p>
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Lojas conectadas</h2>
        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhuma loja conectada ainda.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((s) => {
              const mine = (jobs ?? []).filter((j) => j.shop_id === s.id);
              const pending = mine.filter((j) => j.status !== "erro").length;
              const failed = mine.filter((j) => j.status === "erro");
              const shopAds = (listings ?? []).filter((l) => l.shop_id === s.id);
              const ads = {
                total: shopAds.length,
                linked: shopAds.filter((l) => l.variant_id).length,
              };
              const recent = (logs ?? []).filter((l) => l.shop_id === s.id).slice(0, 6);
              const st = STATUS[s.status as keyof typeof STATUS] ?? STATUS.conectada;
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{s.name ?? `Loja ${s.external_shop_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        Shopee · código {s.external_shop_id}
                        {s.region ? ` · ${s.region}` : ""}
                      </p>
                    </div>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Pill>{`Estoque enviado: ${Math.round(s.stock_ratio * 100)}%`}</Pill>
                    <Pill tone={s.chat_message_enabled ? "info" : "muted"}>
                      {s.chat_message_enabled
                        ? "Mensagem automática ligada"
                        : "Sem mensagem automática"}
                    </Pill>
                    <Pill tone={pending ? "warning" : "muted"}>{`Fila: ${pending}`}</Pill>
                    <Pill tone={ads.total > ads.linked ? "warning" : "muted"}>
                      {`Anúncios vinculados: ${ads.linked} de ${ads.total}`}
                    </Pill>
                    {failed.length > 0 && <Pill tone="danger">{`Com erro: ${failed.length}`}</Pill>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {s.last_sync_at
                      ? `Última sincronização ${formatDateTime(s.last_sync_at)}`
                      : "Ainda não sincronizou"}
                  </p>
                  {s.last_error && <p className="text-sm text-destructive">{s.last_error}</p>}
                  {failed[0]?.last_error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Último erro ({failed[0].kind}): {failed[0].last_error}
                    </p>
                  )}
                  {recent.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Últimas chamadas
                      </summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {recent.map((l, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span className={l.ok ? "" : "text-destructive"}>
                              {l.direction === "entrada" ? "← " : "→ "}
                              {l.endpoint}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatDateTime(l.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-8">
                      <Link href={`/configuracoes/integracoes/${s.id}/anuncios`}>
                        <ListChecks />
                        Anúncios e estoque
                      </Link>
                    </Button>
                    {canManage && <ShopActions shop={s} failedJobs={failed.length} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

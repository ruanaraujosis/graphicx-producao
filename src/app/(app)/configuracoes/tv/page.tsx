import { Tv } from "lucide-react";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { IconChip } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ConnectTvDialog, NewTvButton, RotationDialog, TvDeviceActions } from "./tv-client";

export const metadata = { title: "Dispositivos de TV" };

export default function TvConfigPage({ searchParams }: PageProps<"/configuracoes/tv">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes" label="Configurações" />
      <Suspense fallback={<ListSkeleton />}>
        <Dispositivos searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Dispositivos({
  searchParams,
}: {
  searchParams: PageProps<"/configuracoes/tv">["searchParams"];
}) {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const raw = await searchParams;
  const code = typeof raw.codigo === "string" ? raw.codigo.slice(0, 8) : null;
  const org = membership.organizationId;
  const supabase = await createClient();
  const [{ data: devices }, { data: settings }] = await Promise.all([
    supabase
      .from("tv_devices")
      .select("id, name, token, show_financials, revoked_at, last_seen_at, created_at")
      .eq("organization_id", org)
      .order("revoked_at", { ascending: true, nullsFirst: true })
      .order("created_at"),
    supabase
      .from("organization_settings")
      .select("tv_rotation_seconds")
      .eq("organization_id", org)
      .maybeSingle(),
  ]);
  const list = devices ?? [];

  return (
    <>
      <PageHeader
        title="Dispositivos de TV"
        description="Painel da produção em tela cheia: pedidos por etapa, prazos, artes, faturamento e estoque crítico."
        actions={
          <>
            <RotationDialog seconds={settings?.tv_rotation_seconds ?? 15} />
            <NewTvButton />
            <ConnectTvDialog
              devices={list.map((d) => ({
                id: d.id,
                name: d.name,
                revoked: Boolean(d.revoked_at),
              }))}
              initialCode={code}
            />
          </>
        }
      />

      <ul className="grid gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm md:grid-cols-3">
        <li>
          <strong>Com código (como no YouTube):</strong> no navegador da TV, abra o endereço do
          GraphicX com <code className="font-mono">/tv</code> no fim. Ela mostra um código; toque em{" "}
          <em>Conectar TV</em> e digite, ou leia o QR da TV com o celular.
        </li>
        <li>
          <strong>Transmitir:</strong> com uma TV com Chromecast na mesma rede, toque em{" "}
          <em>Transmitir</em> na TV da lista (Chrome do computador ou do Android).
        </li>
        <li>
          <strong>Por link:</strong> crie a TV, toque em <em>Copiar link</em> e abra no navegador da
          TV. O painel atualiza sozinho a cada 30 s.
        </li>
      </ul>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhuma TV ainda.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((d) => (
            <li
              key={d.id}
              className={`flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm ${d.revoked_at ? "opacity-60" : ""}`}
            >
              <div className="flex items-start gap-3">
                <IconChip icon={Tv} tone={d.revoked_at ? "warning" : "primary"} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.last_seen_at
                      ? `Visto por último ${formatDateTime(d.last_seen_at)}`
                      : "Ainda não foi aberta"}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {d.revoked_at ? (
                    <Pill tone="danger">Desligada</Pill>
                  ) : (
                    <Pill tone="success">Ativa</Pill>
                  )}
                  <Pill>{d.show_financials ? "Mostra R$" : "Sem valores"}</Pill>
                </div>
              </div>
              <TvDeviceActions
                device={{
                  id: d.id,
                  name: d.name,
                  token: d.token,
                  show_financials: d.show_financials,
                  revoked: Boolean(d.revoked_at),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

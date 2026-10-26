import { ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { KEEP_AUTOMATIC } from "@/lib/backups/organization-backup";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { BackupNowButton } from "./backup-button";

export const metadata = { title: "Backups das gráficas" };

const STATUS = {
  pronto: { label: "Pronto", tone: "success" },
  processando: { label: "Em andamento", tone: "info" },
  erro: { label: "Erro", tone: "danger" },
} as const;

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/plataforma" label="Plataforma" />
      <PageHeader
        title="Backups das gráficas"
        description={`Cópia de todos os dados de cada gráfica, separada das outras. Rotina automática todo dia de madrugada; guardamos os últimos ${KEEP_AUTOMATIC} automáticos de cada uma.`}
      />
      <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Os arquivos ficam num armazenamento que só o servidor acessa. Aqui você acompanha data,
        tamanho e quantidade de registros — o conteúdo das gráficas continua privado.
      </p>
      <Suspense fallback={<ListSkeleton />}>
        <Backups />
      </Suspense>
    </div>
  );
}

async function Backups() {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: orgs }, { data: backups }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, active")
      .order("active", { ascending: false })
      .order("name"),
    supabase
      .from("platform_backups")
      .select("id, organization_id, kind, status, size_bytes, row_counts, error, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {(orgs ?? []).map((o) => {
        const mine = (backups ?? []).filter((b) => b.organization_id === o.id);
        const last = mine.find((b) => b.status === "pronto");
        const rows = last
          ? Object.values(last.row_counts as Record<string, number>).reduce((s, n) => s + n, 0)
          : 0;
        return (
          <li key={o.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{o.name}</p>
                <p className="text-xs text-muted-foreground">
                  {last
                    ? `Último backup ${formatDateTime(last.created_at)} · ${formatSize(last.size_bytes)} · ${rows.toLocaleString("pt-BR")} registros`
                    : "Ainda sem backup"}
                </p>
              </div>
              {!o.active && <Pill tone="muted">Inativa</Pill>}
            </div>
            <BackupNowButton organizationId={o.id} />
            {mine.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Histórico ({mine.length})
                </summary>
                <ul className="mt-2 flex flex-col divide-y">
                  {mine.slice(0, 20).map((b) => {
                    const st = STATUS[b.status as keyof typeof STATUS] ?? STATUS.erro;
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="tabular-nums">{formatDateTime(b.created_at)}</span>
                        <Pill tone={b.kind === "manual" ? "info" : "muted"}>
                          {b.kind === "manual" ? "Manual" : "Automático"}
                        </Pill>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        <span className="ml-auto text-muted-foreground tabular-nums">
                          {formatSize(b.size_bytes)}
                        </span>
                        {b.error && <p className="w-full text-xs text-destructive">{b.error}</p>}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

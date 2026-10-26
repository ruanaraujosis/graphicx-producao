import { Hourglass, Inbox, PenTool, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/kit/back-link";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { Pill } from "@/components/kit/data-list";
import { DueBadge, StatusPill } from "@/components/kit/order-badges";
import { PageHeader } from "@/components/kit/page-header";
import { StatCard } from "@/components/kit/stat-card";
import { requireOrg } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/orders/deadline";
import { orderNumber, type OrderStatus } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Artes" };

const QUEUE: { status: OrderStatus; title: string; empty: string }[] = [
  { status: "arte_em_criacao", title: "Para fazer", empty: "Nada para criar agora." },
  {
    status: "aguardando_arte",
    title: "Esperando o cliente enviar",
    empty: "Ninguém devendo arquivo.",
  },
  {
    status: "aguardando_aprovacao",
    title: "Com o cliente para aprovar",
    empty: "Nenhuma prova pendente.",
  },
];

export default function ArtesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Artes"
        description="Fila do designer: o que criar, o que espera o cliente e o que está em aprovação."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Fila />
      </Suspense>
    </div>
  );
}

async function Fila() {
  const { membership } = await requireOrg("artes.ver");
  const supabase = await createClient();
  const today = todayIso();
  const { data } = await supabase
    .from("orders")
    .select(
      "id, number, status, channel, customer_name, due_date, status_changed_at, art_versions(version, status), art_files(count)",
    )
    .eq("organization_id", membership.organizationId)
    .eq("needs_art", true)
    .in("status", ["aguardando_arte", "arte_em_criacao", "aguardando_aprovacao"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(300);
  const orders = data ?? [];

  const changesRequested = orders.filter(
    (o) => o.status === "arte_em_criacao" && o.art_versions.some((v) => v.status === "alteracao"),
  ).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={PenTool}
          tone="primary"
          value={orders.filter((o) => o.status === "arte_em_criacao").length}
          label="Para fazer"
        />
        <StatCard
          icon={RotateCcw}
          tone="danger"
          value={changesRequested}
          label="Alterações pedidas"
        />
        <StatCard
          icon={Inbox}
          tone="warning"
          value={orders.filter((o) => o.status === "aguardando_arte").length}
          label="Esperando arquivo"
        />
        <StatCard
          icon={Hourglass}
          tone="info"
          value={orders.filter((o) => o.status === "aguardando_aprovacao").length}
          label="Em aprovação"
        />
      </div>

      {QUEUE.map((q) => {
        const list = orders.filter((o) => o.status === q.status);
        return (
          <section
            key={q.status}
            aria-labelledby={`fila-${q.status}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`fila-${q.status}`} className="flex items-center gap-2 font-semibold">
              {q.title}
              <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                {list.length}
              </span>
            </h2>
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                {q.empty}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((o) => {
                  const last = [...o.art_versions].sort((a, b) => b.version - a.version)[0];
                  const files = o.art_files[0]?.count ?? 0;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/pedidos/${o.id}`}
                        className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">
                            {orderNumber(o.number)} ·{" "}
                            <span className="font-medium">{o.customer_name}</span>
                          </p>
                          <DueBadge due={o.due_date} status={o.status} today={today} />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusPill status={o.status} />
                          <ChannelBadge channel={o.channel} />
                          {last && (
                            <Pill tone={last.status === "alteracao" ? "danger" : "muted"}>
                              {last.status === "alteracao"
                                ? `v${last.version}: alteração pedida`
                                : `Última prova: v${last.version}`}
                            </Pill>
                          )}
                          {files > 0 && <Pill tone="info">{`${files} arquivo(s) do cliente`}</Pill>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Nesta etapa desde {formatDateTime(o.status_changed_at)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

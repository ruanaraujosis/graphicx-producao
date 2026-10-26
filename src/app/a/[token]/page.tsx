import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, Clock, FileText, Link2Off, XCircle } from "lucide-react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ART_BUCKET } from "@/lib/art/files";
import { formatDateTime } from "@/lib/format";
import { orderNumber, isBefore, type OrderStatus } from "@/lib/orders/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClientUploader, ProofReview } from "./client-art";
import { clientIp, isTokenFormat } from "./link";

export const metadata: Metadata = {
  title: "Arte do pedido",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ArtePublicaPage({ params }: PageProps<"/a/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        }
      >
        <ArtePublica params={params} />
      </Suspense>
      <p className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        Link seguro gerado pela gráfica · GraphicX
      </p>
    </main>
  );
}

function Notice({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof XCircle;
  title: string;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-12 text-center shadow-sm">
      <Icon className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

async function ArtePublica({ params }: { params: PageProps<"/a/[token]">["params"] }) {
  const { token } = await params;
  const invalid = (
    <Notice
      icon={Link2Off}
      title="Link inválido ou expirado"
      text="Peça um novo link para a gráfica pelo WhatsApp."
    />
  );
  if (!isTokenFormat(token)) return invalid;

  const admin = createAdminClient();
  const ip = clientIp(await headers());
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_key: `arte-ver:${ip}`,
    p_limit: 120,
    p_window_seconds: 600,
  });
  if (allowed === false) {
    return (
      <Notice
        icon={Clock}
        title="Muitos acessos"
        text="Espere alguns minutos e abra o link de novo."
      />
    );
  }

  const { data: link } = await admin.rpc("resolve_art_link", { p_token: token }).maybeSingle();
  if (!link) return invalid;

  // Tudo filtrado pelo pedido do link.
  const [orgRes, orderRes, versionsRes, reviewsRes, filesRes] = await Promise.all([
    admin.from("organizations").select("name").eq("id", link.organization_id).single(),
    admin
      .from("orders")
      .select("number, status, customer_name, order_items(description, quantity, position)")
      .eq("id", link.order_id)
      .single(),
    admin
      .from("art_versions")
      .select("id, version, status, proof_path, proof_mime, note, created_at")
      .eq("order_id", link.order_id)
      .order("version", { ascending: false }),
    admin
      .from("art_reviews")
      .select("version_id, decision, comment, created_at")
      .eq("order_id", link.order_id)
      .order("created_at", { ascending: false }),
    admin
      .from("art_files")
      .select("file_name, created_at")
      .eq("order_id", link.order_id)
      .order("created_at", { ascending: false }),
  ]);
  const order = orderRes.data;
  if (!order) return invalid;
  const status = order.status as OrderStatus;
  const versions = versionsRes.data ?? [];
  const pending = versions.find((v) => v.status === "pendente") ?? null;
  const approved = versions.find((v) => v.status === "aprovada") ?? null;

  const { data: signed } = pending
    ? await admin.storage.from(ART_BUCKET).createSignedUrl(pending.proof_path, 60 * 60 * 2)
    : { data: null };

  const firstName = order.customer_name.split(" ")[0];
  const canSend =
    status !== "cancelado" && status !== "orcamento" && isBefore(status, "em_impressao");
  const items = [...order.order_items].sort((a, b) => a.position - b.position);

  return (
    <>
      <header className="flex flex-col gap-1 rounded-2xl bg-brand-header px-5 py-5 text-brand-header-foreground shadow-sm">
        <p className="text-sm text-brand-header-muted">{orgRes.data?.name ?? "Gráfica"}</p>
        <h1 className="text-xl font-semibold">
          Olá, {firstName}! Pedido {orderNumber(order.number)}
        </h1>
        <p className="text-sm text-brand-header-muted">
          {items.map((i) => `${i.quantity.toLocaleString("pt-BR")}× ${i.description}`).join(" · ")}
        </p>
      </header>

      {status === "cancelado" ? (
        <Notice
          icon={XCircle}
          title="Pedido cancelado"
          text="Fale com a gráfica se tiver dúvidas."
        />
      ) : pending ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Confira a prova da sua arte (v{pending.version})
          </h2>
          <p className="text-sm text-muted-foreground">
            Veja com calma: textos, cores, tamanho. Se algo precisar mudar, toque na imagem para
            marcar o ponto e conte o que ajustar.
          </p>
          {pending.note && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm">
              Recado da gráfica: {pending.note}
            </p>
          )}
          <ProofReview
            token={token}
            versionId={pending.id}
            proofUrl={signed?.signedUrl ?? null}
            isPdf={pending.proof_mime === "application/pdf"}
            defaultName={order.customer_name}
          />
        </section>
      ) : approved && !isBefore(status, "aprovado") ? (
        <Notice
          icon={CheckCircle2}
          title="Arte aprovada"
          text={`Você aprovou a v${approved.version}. Seu pedido está em produção.`}
        />
      ) : (
        <div className="rounded-2xl border bg-card px-5 py-6 text-sm shadow-sm">
          <p className="font-medium">
            {versions.length === 0
              ? "A gráfica ainda vai preparar a prova da sua arte."
              : "A gráfica está ajustando a arte com o que você pediu."}
          </p>
          <p className="mt-1 text-muted-foreground">
            Quando a prova ficar pronta, ela aparece aqui neste mesmo link.
          </p>
        </div>
      )}

      {canSend && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Enviar arquivos</h2>
          <p className="text-sm text-muted-foreground">
            Logo, fotos, textos ou referências (até 50 MB por arquivo).
          </p>
          <ClientUploader token={token} />
          {(filesRes.data ?? []).length > 0 && (
            <ul className="flex flex-col gap-1.5 border-t pt-3">
              {(filesRes.data ?? []).map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(f.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(reviewsRes.data ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Suas respostas</h2>
          <ul className="flex flex-col gap-2">
            {(reviewsRes.data ?? []).map((r, i) => {
              const v = versions.find((x) => x.id === r.version_id);
              return (
                <li key={i} className="rounded-xl border bg-card px-3 py-2 text-sm">
                  <span className="font-medium">
                    v{v?.version ?? "?"}:{" "}
                    {r.decision === "aprovada" ? "aprovada" : "alteração pedida"}
                  </span>
                  <span className="text-muted-foreground"> · {formatDateTime(r.created_at)}</span>
                  {r.comment && <p className="mt-1 text-muted-foreground">“{r.comment}”</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

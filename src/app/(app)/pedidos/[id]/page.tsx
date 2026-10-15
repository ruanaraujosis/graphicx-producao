import { FileText, MessageCircle, Pencil, Phone, Tag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cn } from "cn";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { ChannelBadge } from "@/components/kit/channel-badge";
import { Pill } from "@/components/kit/data-list";
import { DueBadge, StatusPill } from "@/components/kit/order-badges";
import { Button } from "@/components/ui/button";
import { ART_BUCKET, formatBytes } from "@/lib/art/files";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { digits, formatPhone } from "@/lib/documents";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/orders/deadline";
import {
  STATUS_LABELS,
  STOCK_STATE_LABELS,
  isBefore,
  orderNumber,
  type OrderStatus,
} from "@/lib/orders/status";
import { orderQrPng, orderUrl } from "@/lib/orders/qrcode";
import { OrderQrDialog } from "./order-qr-dialog";
import { ShopeeShipping } from "./shopee-shipping";
import { SHOPEE_STATUS_LABELS } from "@/lib/marketplaces/shopee/labels";
import { createClient } from "@/lib/supabase/server";
import {
  ArtLinkBox,
  ArtUploadButton,
  CommentForm,
  DownloadButton,
  StatusActions,
} from "./order-client";

export const metadata = { title: "Pedido" };

type Params = PageProps<"/pedidos/[id]">["params"];

export default function PedidoPage({ params }: PageProps<"/pedidos/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/pedidos" label="Pedidos" />
      <Suspense fallback={<ListSkeleton />}>
        <Pedido params={params} />
      </Suspense>
    </div>
  );
}

const VERSION_STATUS = {
  pendente: { label: "Aguardando o cliente", tone: "warning" },
  aprovada: { label: "Aprovada", tone: "success" },
  alteracao: { label: "Alteração pedida", tone: "danger" },
  substituida: { label: "Substituída", tone: "muted" },
} as const;

async function Pedido({ params }: { params: Params }) {
  const { id } = await params;
  const { membership } = await requireOrg(["pedidos.ver", "artes.ver", "pcp.ver", "expedicao.ver"]);
  const perms = membership.permissions;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, number, status, channel, customer_id, customer_name, customer_phone, needs_art, due_date, subtotal, discount, shipping, total, notes, tracking_code, cancel_reason, created_at, external_id, shop_id, external_status, ship_by_at, package_number, channel_fee, shipment_arranged_at, marketplace_shops(name), payment_methods(name), order_items(id, description, quantity, unit_price, stock_state, position, variant_id, product_variants(sku))",
    )
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!order) notFound();

  const canSeeArt = can(perms, ["pedidos.ver", "artes.ver", "pcp.ver"]);
  const [eventsRes, linkRes, filesRes, versionsRes, reviewsRes] = await Promise.all([
    supabase
      .from("order_events")
      .select("id, type, from_status, to_status, message, actor_id, actor_label, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    can(perms, ["pedidos.ver", "artes.ver"])
      ? supabase
          .from("art_links")
          .select("id, token, expires_at")
          .eq("order_id", id)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    canSeeArt
      ? supabase
          .from("art_files")
          .select("id, path, file_name, size_bytes, uploaded_by, created_at")
          .eq("order_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    canSeeArt
      ? supabase
          .from("art_versions")
          .select(
            "id, version, proof_path, proof_mime, final_path, final_name, note, status, created_at, reviewed_at",
          )
          .eq("order_id", id)
          .order("version", { ascending: false })
      : Promise.resolve({ data: [] }),
    canSeeArt
      ? supabase
          .from("art_reviews")
          .select("id, version_id, decision, comment, pins, reviewer_name, created_at")
          .eq("order_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const events = eventsRes.data ?? [];
  const versions = versionsRes.data ?? [];
  const files = filesRes.data ?? [];
  const reviews = reviewsRes.data ?? [];

  // Nomes de quem agiu na linha do tempo.
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  // Miniaturas das provas (URLs temporárias).
  const imagePaths = versions
    .filter((v) => v.proof_mime.startsWith("image/"))
    .map((v) => v.proof_path);
  const { data: signed } = imagePaths.length
    ? await supabase.storage.from(ART_BUCKET).createSignedUrls(imagePaths, 60 * 60)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const items = [...order.order_items].sort((a, b) => a.position - b.position);
  const status = order.status as OrderStatus;
  const canManageOrder = can(perms, "pedidos.gerenciar");
  const canManageArt = can(perms, "artes.gerenciar");
  const canLink = can(perms, ["pedidos.gerenciar", "artes.gerenciar"]);
  const editable = canManageOrder && !["enviado", "entregue", "cancelado"].includes(status);
  // Provas só antes da impressão (o banco recusa depois).
  const artStage =
    status !== "orcamento" && status !== "cancelado" && isBefore(status, "em_impressao");
  const phone = order.customer_phone ? digits(order.customer_phone) : "";
  const qrPng = await orderQrPng(order.id);

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Pedido {orderNumber(order.number)}
            <span className="font-normal text-muted-foreground"> · {order.customer_name}</span>
          </h1>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill status={status} />
            <DueBadge due={order.due_date} status={status} today={todayIso()} />
            <ChannelBadge channel={order.channel} />
            {order.needs_art ? <Pill tone="info">Com arte</Pill> : <Pill>Sem arte</Pill>}
          </div>
          {order.cancel_reason && (
            <p className="text-sm text-destructive">Cancelado: {order.cancel_reason}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderQrDialog
            orderId={order.id}
            label={orderNumber(order.number)}
            png={qrPng}
            url={orderUrl(order.id)}
          />
          {status !== "cancelado" && status !== "orcamento" && (
            <Button variant="outline" asChild>
              <a
                href={
                  // Etiqueta oficial só para pedido que veio da Shopee; os outros usam o modelo da gráfica.
                  order.external_id && order.shop_id
                    ? `/api/marketplaces/shopee/etiquetas?pedidos=${order.id}&tipo=termica`
                    : `/imprimir/envio?ids=${order.id}`
                }
                target="_blank"
                rel="noreferrer"
              >
                <Tag />
                Etiqueta de envio
              </a>
            </Button>
          )}
          {editable && (
            <Button variant="outline" asChild>
              <Link href={`/pedidos/${order.id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          )}
          <StatusActions
            orderId={order.id}
            status={status}
            needsArt={order.needs_art}
            permissions={perms}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Itens */}
          <Card title="Itens">
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{i.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.quantity.toLocaleString("pt-BR")} × {formatCurrency(i.unit_price)}
                      {i.product_variants?.sku ? ` · ${i.product_variants.sku}` : " · avulso"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.variant_id && (
                      <Pill
                        tone={
                          i.stock_state === "baixado"
                            ? "secondary"
                            : i.stock_state === "reservado"
                              ? "info"
                              : "muted"
                        }
                      >
                        {STOCK_STATE_LABELS[i.stock_state]}
                      </Pill>
                    )}
                    <span className="font-medium">
                      {formatCurrency(Math.round(i.quantity * i.unit_price * 100) / 100)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Arte */}
          {order.needs_art && canSeeArt && (
            <Card
              title="Arte"
              description="O cliente envia os arquivos e aprova a prova pelo link. Cada prova enviada vira uma versão."
              actions={
                canManageArt && artStage ? (
                  <ArtUploadButton
                    orderId={order.id}
                    kind="prova"
                    label="Enviar prova"
                    variant="default"
                  />
                ) : undefined
              }
            >
              <div className="flex flex-col gap-5">
                <ArtLinkBox
                  orderId={order.id}
                  orderLabel={orderNumber(order.number)}
                  orgName={membership.name}
                  customerName={order.customer_name}
                  customerPhone={order.customer_phone}
                  link={linkRes.data}
                  canManage={canLink && status !== "cancelado"}
                />

                <section aria-labelledby="arquivos-cliente">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 id="arquivos-cliente" className="text-sm font-semibold">
                      Arquivos do cliente
                    </h3>
                    {canLink && (
                      <ArtUploadButton
                        orderId={order.id}
                        kind="cliente"
                        label="Anexar"
                        variant="ghost"
                      />
                    )}
                  </div>
                  {files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum arquivo ainda.</p>
                  ) : (
                    <ul className="divide-y rounded-xl border">
                      {files.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{f.file_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {[
                                  formatBytes(f.size_bytes),
                                  formatDateTime(f.created_at),
                                  f.uploaded_by ? "anexado pela equipe" : "enviado pelo cliente",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          </div>
                          <DownloadButton path={f.path} fileName={f.file_name} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="provas">
                  <h3 id="provas" className="mb-2 text-sm font-semibold">
                    Provas
                  </h3>
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma prova enviada. Use “Enviar prova” (JPG, PNG, WebP ou PDF): a marca
                      d&apos;água é aplicada automaticamente.
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {versions.map((v) => {
                        const vs = VERSION_STATUS[v.status];
                        const vReviews = reviews.filter((r) => r.version_id === v.id);
                        const thumb = urlByPath.get(v.proof_path);
                        return (
                          <li key={v.id} className="flex flex-col gap-2 rounded-xl border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">v{v.version}</span>
                              <Pill tone={vs.tone}>{vs.label}</Pill>
                            </div>
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária
                              <img
                                src={thumb}
                                alt={`Prova v${v.version}`}
                                className="aspect-video w-full rounded-lg border bg-muted object-contain"
                              />
                            ) : (
                              <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
                                PDF
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Enviada {formatDateTime(v.created_at)}
                            </p>
                            {vReviews.map((r) => (
                              <p
                                key={r.id}
                                className={cn(
                                  "rounded-lg px-2 py-1.5 text-xs",
                                  r.decision === "aprovada"
                                    ? "bg-success-soft text-success"
                                    : "bg-destructive/10 text-destructive",
                                )}
                              >
                                {r.decision === "aprovada" ? "Aprovada" : "Alteração"} por{" "}
                                {r.reviewer_name ?? "cliente"} em {formatDateTime(r.created_at)}
                                {r.comment ? `: “${r.comment}”` : ""}
                                {Array.isArray(r.pins) && r.pins.length > 0
                                  ? ` (${r.pins.length} ponto(s) marcados)`
                                  : ""}
                              </p>
                            ))}
                            <div className="flex flex-wrap gap-1">
                              <DownloadButton
                                path={v.proof_path}
                                fileName={`prova-v${v.version}.${v.proof_mime === "application/pdf" ? "pdf" : "jpg"}`}
                                label="Prova"
                              />
                              {v.final_path ? (
                                <DownloadButton
                                  path={v.final_path}
                                  fileName={v.final_name ?? undefined}
                                  label="Arquivo final"
                                />
                              ) : (
                                v.status === "aprovada" &&
                                canManageArt && (
                                  <ArtUploadButton
                                    orderId={order.id}
                                    kind="final"
                                    versionId={v.id}
                                    label="Anexar final"
                                    variant="ghost"
                                  />
                                )
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            </Card>
          )}

          {/* Linha do tempo */}
          <Card title="Linha do tempo">
            {can(perms, [
              "pedidos.gerenciar",
              "artes.gerenciar",
              "pcp.gerenciar",
              "expedicao.gerenciar",
            ]) && (
              <div className="mb-4">
                <CommentForm orderId={order.id} />
              </div>
            )}
            <ol className="flex flex-col gap-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {e.actor_label ??
                          (e.actor_id ? nameById.get(e.actor_id) : null) ??
                          "Sistema"}
                      </span>{" "}
                      {eventText(e)}
                    </p>
                    {e.message && e.type !== "prova" && (
                      <p className="text-sm whitespace-pre-line text-muted-foreground">
                        {e.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Resumo">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {order.shipping > 0 && <Row label="Frete" value={formatCurrency(order.shipping)} />}
              {order.discount > 0 && (
                <Row label="Desconto" value={`− ${formatCurrency(order.discount)}`} />
              )}
              <Row label="Total" value={formatCurrency(order.total)} strong />
              <Row label="Pagamento" value={order.payment_methods?.name ?? "Não informado"} />
              <Row label="Criado em" value={formatDateTime(order.created_at)} />
              {order.tracking_code && <Row label="Rastreio" value={order.tracking_code} />}
              {order.channel_fee != null && (
                <>
                  <Row
                    label="Taxas do marketplace"
                    value={`− ${formatCurrency(order.channel_fee)}`}
                  />
                  <Row
                    label="Você recebe"
                    value={formatCurrency(order.total - order.channel_fee)}
                    strong
                  />
                </>
              )}
            </dl>
          </Card>

          {order.external_id && (
            <Card title="Marketplace">
              <dl className="flex flex-col gap-1.5 text-sm">
                {order.marketplace_shops?.name && (
                  <Row label="Loja" value={order.marketplace_shops.name} />
                )}
                <Row label="Pedido" value={order.external_id} />
                {order.external_status && (
                  <Row
                    label="Situação lá"
                    value={SHOPEE_STATUS_LABELS[order.external_status] ?? order.external_status}
                  />
                )}
                {order.ship_by_at && (
                  <Row label="Postar até" value={formatDateTime(order.ship_by_at)} strong />
                )}
                {order.package_number && <Row label="Pacote" value={order.package_number} />}
              </dl>
              {order.channel === "shopee" && status !== "cancelado" && (
                <ShopeeShipping
                  orderId={order.id}
                  canArrange={
                    !order.shipment_arranged_at &&
                    ["READY_TO_SHIP", "RETRY_SHIP"].includes(order.external_status ?? "")
                  }
                  canManage={can(perms, "expedicao.gerenciar")}
                  canTrack={Boolean(order.tracking_code)}
                />
              )}
            </Card>
          )}

          <Card title="Cliente">
            <p className="font-medium">{order.customer_name}</p>
            {phone && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild className="min-h-11 md:min-h-8">
                  <a
                    href={`https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    {formatPhone(phone)}
                  </a>
                </Button>
                <Button variant="ghost" size="sm" asChild className="min-h-11 md:min-h-8">
                  <a href={`tel:+55${phone}`}>
                    <Phone />
                    Ligar
                  </a>
                </Button>
              </div>
            )}
            {order.customer_id && can(perms, ["cadastros.ver", "pedidos.ver"]) && (
              <Link
                href={`/cadastros/clientes?q=${encodeURIComponent(order.customer_name)}`}
                className="mt-2 inline-block text-sm text-primary hover:underline"
              >
                Ver cadastro
              </Link>
            )}
          </Card>

          {order.notes && (
            <Card title="Observações">
              <p className="text-sm whitespace-pre-line">{order.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function eventText(e: {
  type: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  message: string | null;
}) {
  switch (e.type) {
    case "criado":
      return e.to_status === "orcamento" ? "criou o orçamento" : "criou o pedido";
    case "status":
      return `moveu para ${e.to_status ? STATUS_LABELS[e.to_status] : "?"}`;
    case "comentario":
      return "comentou";
    case "link_arte":
      return "gerou o link do cliente";
    case "arquivo_cliente":
      return "enviou um arquivo";
    case "prova":
      return `enviou a ${e.message?.match(/v\d+/)?.[0] ?? "prova"} para aprovação`;
    case "arte_aprovada":
      return "aprovou a arte";
    case "alteracao_pedida":
      return "pediu alteração na arte";
    case "arte_final":
      return "anexou o arquivo final";
    default:
      return e.type;
  }
}

function Card({
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
    <section className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right", strong && "text-base font-semibold")}>{value}</dd>
    </div>
  );
}

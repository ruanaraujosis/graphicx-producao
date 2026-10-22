import { Copy, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { Pill } from "@/components/kit/data-list";
import { PageHeader } from "@/components/kit/page-header";
import { LabelThumb } from "@/components/labels/label-thumb";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { listTemplates, templateImageUrls } from "@/lib/labels/load";
import { BUILTIN_TEMPLATES, KIND_LABELS, type LabelKind } from "@/lib/labels/template";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { createClient } from "@/lib/supabase/server";
import { createTemplate } from "./actions";
import { DeleteTemplateButton, MakeDefaultButton } from "./templates-client";

export const metadata = { title: "Modelos de etiqueta" };

const KIND_HINTS: Record<LabelKind, string> = {
  envio:
    "Balcão, WhatsApp e pedidos lançados à mão. Pedidos que vieram da Shopee usam a etiqueta oficial da Shopee.",
  identificacao: "Etiqueta com QR Code para identificar o pedido na produção e no pacote.",
};

export default function EtiquetasPage() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes" label="Configurações" />
      <PageHeader
        title="Modelos de etiqueta"
        description="Use o modelo do GraphicX, crie o seu do zero ou suba a arte da sua etiqueta e posicione os campos por cima."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Modelos />
      </Suspense>
    </div>
  );
}

async function Modelos() {
  const { membership } = await requireOrg(["configuracoes.ver", "expedicao.ver"]);
  const canManage = can(membership.permissions, ["configuracoes.gerenciar", "expedicao.gerenciar"]);
  const supabase = await createClient();
  const kinds: LabelKind[] = ["envio", "identificacao"];
  const [lists, qr] = await Promise.all([
    Promise.all(kinds.map((k) => listTemplates(supabase, membership.organizationId, k))),
    orderQrSvg("00000000-0000-0000-0000-000000000000"),
  ]);
  const urls = Object.assign(
    {},
    ...(await Promise.all(lists.flat().map((t) => templateImageUrls(supabase, t)))),
  ) as Record<string, string>;

  return (
    <>
      {kinds.map((kind, k) => {
        const list = lists[k];
        const builtin = BUILTIN_TEMPLATES[kind];
        const builtinIsDefault = !list.some((t) => t.is_default);
        const cards = [{ ...builtin, is_default: builtinIsDefault }, ...list];
        return (
          <section key={kind} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-base font-semibold">{KIND_LABELS[kind]}</h2>
                <p className="text-sm text-muted-foreground">{KIND_HINTS[kind]}</p>
              </div>
              {canManage && (
                <form action={createTemplate.bind(null, kind, null)}>
                  <Button type="submit" className="min-h-11 md:min-h-9">
                    <Plus />
                    Novo modelo
                  </Button>
                </form>
              )}
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((t) => (
                <li
                  key={t.id ?? "graphicx"}
                  className="flex gap-4 rounded-2xl border bg-card p-4 shadow-sm"
                >
                  <LabelThumb
                    width={t.width_mm}
                    height={t.height_mm}
                    elements={t.elements}
                    backgroundUrl={t.background_path ? urls[t.background_path] : null}
                    imageUrls={urls}
                    qrSvg={qr}
                    maxWidth={110}
                    maxHeight={150}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.width_mm} × {t.height_mm} mm{t.id ? "" : " · embutido"}
                      </p>
                    </div>
                    {t.is_default && <Pill tone="success">Padrão</Pill>}
                    {canManage && (
                      <div className="mt-auto flex flex-wrap gap-2">
                        {t.id && (
                          <Button asChild size="sm" className="min-h-11 md:min-h-8">
                            <Link href={`/configuracoes/etiquetas/${t.id}`}>
                              <Pencil />
                              Editar
                            </Link>
                          </Button>
                        )}
                        <form action={createTemplate.bind(null, kind, t.id)}>
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="min-h-11 md:min-h-8"
                          >
                            <Copy />
                            {t.id ? "Duplicar" : "Duplicar para editar"}
                          </Button>
                        </form>
                        {!t.is_default && <MakeDefaultButton id={t.id} kind={kind} />}
                        {t.id && <DeleteTemplateButton id={t.id} name={t.name} />}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

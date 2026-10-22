import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, ListSkeleton } from "@/components/kit/back-link";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import { templateImageUrls, toTemplate } from "@/lib/labels/load";
import { KIND_LABELS } from "@/lib/labels/template";
import { orderQrSvg } from "@/lib/orders/qrcode";
import { createClient } from "@/lib/supabase/server";
import { DeleteTemplateButton } from "../templates-client";
import { LabelEditor } from "./label-editor";

export const metadata = { title: "Editar modelo de etiqueta" };

type Props = PageProps<"/configuracoes/etiquetas/[id]">;

export default function EditarModeloPage({ params }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/configuracoes/etiquetas" label="Modelos de etiqueta" />
      <Suspense fallback={<ListSkeleton />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: { params: Props["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { membership } = await requireOrg(["configuracoes.gerenciar", "expedicao.gerenciar"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("label_templates")
    .select("id, kind, name, width_mm, height_mm, elements, background_path")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!data) notFound();
  const template = toTemplate(data);
  const [urls, qr] = await Promise.all([
    templateImageUrls(supabase, template),
    orderQrSvg("00000000-0000-0000-0000-000000000000"),
  ]);

  return (
    <>
      <PageHeader
        title={template.name}
        description={`${KIND_LABELS[template.kind]} · ${template.width_mm} × ${template.height_mm} mm`}
        actions={
          <DeleteTemplateButton
            id={template.id!}
            name={template.name}
            redirectTo="/configuracoes/etiquetas"
          />
        }
      />
      <LabelEditor
        id={template.id!}
        organizationId={membership.organizationId}
        initial={{
          name: template.name,
          width_mm: template.width_mm,
          height_mm: template.height_mm,
          elements: template.elements,
          background_path: template.background_path,
        }}
        initialUrls={urls}
        qrSvg={qr}
      />
    </>
  );
}

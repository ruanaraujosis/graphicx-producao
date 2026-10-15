"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { toTemplate } from "@/lib/labels/load";
import { BUILTIN_TEMPLATES, type LabelKind, labelTemplateSchema } from "@/lib/labels/template";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/configuracoes/etiquetas";
const WRITE = ["configuracoes.gerenciar", "expedicao.gerenciar"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

/** Cria um modelo a partir do embutido do GraphicX ou de outro modelo, e abre o editor. */
export async function createTemplate(kind: LabelKind, fromId: string | null) {
  const { membership } = await requireOrg([...WRITE]);
  if (kind !== "envio" && kind !== "identificacao") return;
  const supabase = await createClient();
  let base = BUILTIN_TEMPLATES[kind];
  if (fromId && UUID.test(fromId)) {
    const { data } = await supabase
      .from("label_templates")
      .select("id, kind, name, width_mm, height_mm, elements, background_path")
      .eq("id", fromId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();
    if (data) base = toTemplate(data);
  }
  const { count } = await supabase
    .from("label_templates")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", membership.organizationId)
    .eq("kind", kind);
  const { data, error } = await supabase
    .from("label_templates")
    .insert({
      organization_id: membership.organizationId,
      kind,
      name: fromId ? `${base.name} (cópia)`.slice(0, 80) : "Meu modelo",
      width_mm: base.width_mm,
      height_mm: base.height_mm,
      elements: base.elements,
      background_path: base.background_path,
      // O primeiro modelo da gráfica já vira o padrão.
      is_default: !count,
    })
    .select("id")
    .single();
  if (error || !data) return;
  revalidatePath(PAGE);
  redirect(`${PAGE}/${data.id}`);
}

export async function saveTemplate(id: string, input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg([...WRITE]);
  if (!UUID.test(id)) return { ok: false, error: "Modelo inválido." };
  const parsed = labelTemplateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira o modelo." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("label_templates")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, message: "Modelo salvo." };
}

/** Vira o modelo padrão do tipo (o anterior deixa de ser). */
export async function setDefaultTemplate(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg([...WRITE]);
  if (!UUID.test(id)) return { ok: false, error: "Modelo inválido." };
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("label_templates")
    .select("kind")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!t) return { ok: false, error: "Modelo não encontrado." };
  await supabase
    .from("label_templates")
    .update({ is_default: false })
    .eq("organization_id", membership.organizationId)
    .eq("kind", t.kind)
    .eq("is_default", true);
  const { error } = await supabase
    .from("label_templates")
    .update({ is_default: true })
    .eq("id", id);
  if (error) return { ok: false, error: "Não foi possível definir o padrão." };
  revalidatePath(PAGE);
  return { ok: true, message: "Modelo padrão atualizado." };
}

/** Volta a usar o modelo embutido do GraphicX como padrão. */
export async function resetToBuiltinTemplate(kind: LabelKind): Promise<ActionResult> {
  const { membership } = await requireOrg([...WRITE]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("label_templates")
    .update({ is_default: false })
    .eq("organization_id", membership.organizationId)
    .eq("kind", kind)
    .eq("is_default", true);
  if (error) return { ok: false, error: "Não foi possível alterar o padrão." };
  revalidatePath(PAGE);
  return { ok: true, message: "O modelo GraphicX voltou a ser o padrão." };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg([...WRITE]);
  if (!UUID.test(id)) return { ok: false, error: "Modelo inválido." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("label_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error) return { ok: false, error: "Não foi possível excluir." };
  revalidatePath(PAGE);
  return { ok: true, message: "Modelo excluído." };
}

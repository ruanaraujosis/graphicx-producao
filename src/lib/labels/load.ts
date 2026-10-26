import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  BUILTIN_TEMPLATES,
  type LabelKind,
  type LabelTemplate,
  labelElementSchema,
} from "./template";

type Db = Awaited<ReturnType<typeof createClient>>;

export const LABEL_BUCKET = "etiquetas";

/** Converte a linha do banco (elementos inválidos são ignorados). */
export function toTemplate(row: {
  id: string;
  kind: string;
  name: string;
  width_mm: number;
  height_mm: number;
  elements: unknown;
  background_path: string | null;
}): LabelTemplate {
  const elements = Array.isArray(row.elements)
    ? row.elements.flatMap((e) => {
        const parsed = labelElementSchema.safeParse(e);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  return {
    id: row.id,
    kind: row.kind as LabelKind,
    name: row.name,
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    elements,
    background_path: row.background_path,
  };
}

/** Modelos da gráfica para o tipo (o padrão primeiro). */
export async function listTemplates(db: Db, orgId: string, kind: LabelKind) {
  const { data } = await db
    .from("label_templates")
    .select("id, kind, name, width_mm, height_mm, elements, background_path, is_default")
    .eq("organization_id", orgId)
    .eq("kind", kind)
    .order("is_default", { ascending: false })
    .order("name");
  return (data ?? []).map((r) => ({ ...toTemplate(r), is_default: r.is_default }));
}

/**
 * Modelo para imprimir: o escolhido (?modelo=, "graphicx" = embutido), senão o padrão da gráfica,
 * senão o modelo embutido do GraphicX.
 */
export async function resolveTemplate(db: Db, orgId: string, kind: LabelKind, id?: string | null) {
  const list = await listTemplates(db, orgId, kind);
  if (id === "graphicx") return { template: BUILTIN_TEMPLATES[kind], list };
  const chosen = (id && list.find((t) => t.id === id)) || list.find((t) => t.is_default);
  return { template: chosen ?? BUILTIN_TEMPLATES[kind], list };
}

/** URLs assinadas (1 h) da arte de fundo e das imagens do modelo. */
export async function templateImageUrls(db: Db, template: LabelTemplate) {
  const paths = [
    template.background_path,
    ...template.elements.flatMap((e) => (e.type === "image" && e.path ? [e.path] : [])),
  ].filter((p): p is string => Boolean(p));
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await db.storage.from(LABEL_BUCKET).createSignedUrls(paths, 60 * 60);
  return Object.fromEntries(
    (data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])),
  ) as Record<string, string>;
}

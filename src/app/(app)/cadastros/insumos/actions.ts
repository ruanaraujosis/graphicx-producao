"use server";

import { z } from "zod";
import { saveOrgRecord, type ActionResult } from "@/lib/crud";
import { materialSchema } from "./schema";

export async function saveMaterial(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = materialSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Insumo inválido." };

  return saveOrgRecord({
    table: "materials",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: ["/cadastros/insumos", "/estoque"],
    messages: {
      created: `Insumo ${parsed.data.name} cadastrado. Lance a primeira entrada em Estoque.`,
      updated: "Insumo atualizado.",
      unique: "Já existe um insumo com esse nome ou código.",
      fallback: "Não foi possível salvar o insumo.",
    },
  });
}

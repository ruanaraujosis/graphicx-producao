"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, saveOrgRecord, type ActionResult } from "@/lib/crud";
import { categorySchema } from "./schema";
import { createClient } from "@/lib/supabase/server";

export async function saveCategory(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Categoria inválida." };

  return saveOrgRecord({
    table: "product_categories",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: ["/cadastros/categorias", "/cadastros/produtos"],
    messages: {
      created: `Categoria ${parsed.data.name} criada.`,
      updated: "Categoria renomeada.",
      unique: "Já existe uma categoria com esse nome.",
      fallback: "Não foi possível salvar a categoria.",
    },
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const valid = z.uuid().safeParse(id);
  if (!valid.success) return { ok: false, error: "Categoria inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_categories")
    .delete()
    .eq("id", valid.data)
    .eq("organization_id", membership.organizationId);
  if (error) {
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível excluir." }) };
  }
  revalidatePath("/cadastros/categorias");
  return { ok: true, message: "Categoria excluída. Os produtos dela ficaram sem categoria." };
}

"use server";

import { z } from "zod";
import { saveOrgRecord, type ActionResult } from "@/lib/crud";
import { supplierSchema } from "./schema";

export async function saveSupplier(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Fornecedor inválido." };

  return saveOrgRecord({
    table: "suppliers",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: ["/cadastros/fornecedores", "/cadastros/insumos"],
    messages: {
      created: `Fornecedor ${parsed.data.name} cadastrado.`,
      updated: "Fornecedor atualizado.",
      fallback: "Não foi possível salvar o fornecedor.",
    },
  });
}

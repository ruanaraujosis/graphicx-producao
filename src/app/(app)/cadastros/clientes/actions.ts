"use server";

import { z } from "zod";
import { saveOrgRecord, type ActionResult } from "@/lib/crud";
import { customerSchema } from "./schema";

export async function saveCustomer(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Cliente inválido." };

  return saveOrgRecord({
    table: "customers",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: "/cadastros/clientes",
    messages: {
      created: `Cliente ${parsed.data.name} cadastrado.`,
      updated: "Cliente atualizado.",
      unique: "Já existe um cliente com esse CPF/CNPJ.",
      fallback: "Não foi possível salvar o cliente.",
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, saveOrgRecord, type ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "./schema";

export async function saveCustomer(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Cliente inválido." };

  if (validId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("customers")
      .select("anonymized_at")
      .eq("id", validId.data)
      .maybeSingle();
    if (data?.anonymized_at) {
      return { ok: false, error: "Cliente anonimizado não pode ser editado. Cadastre de novo." };
    }
  }

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

/** LGPD: remove os dados pessoais do cliente (cadastro, pedidos, a receber e auditoria). */
export async function anonymizeCustomer(id: string): Promise<ActionResult> {
  await requireOrg("cadastros.gerenciar");
  const valid = z.uuid().safeParse(id);
  if (!valid.success) return { ok: false, error: "Cliente inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymize_customer", { p_customer: valid.data });
  if (error) {
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível anonimizar o cliente." }),
    };
  }
  revalidatePath("/cadastros/clientes");
  return { ok: true, message: "Dados pessoais removidos. Os pedidos e valores foram mantidos." };
}

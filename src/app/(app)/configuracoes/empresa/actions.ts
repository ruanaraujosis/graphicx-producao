"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { organizationProfileSchema } from "./schema";

/** Nome, razão social, CNPJ, telefone e endereço da gráfica ativa. O código só a plataforma altera. */
export async function saveOrganizationData(input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const parsed = organizationProfileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", membership.organizationId);
  if (error) return { ok: false, error: "Não foi possível salvar os dados da gráfica." };

  // O nome aparece no selo do header.
  revalidatePath("/", "layout");
  return { ok: true, message: "Dados da gráfica atualizados." };
}

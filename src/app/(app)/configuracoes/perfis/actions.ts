"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { expandPermissions, isPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const PAGE = "/configuracoes/perfis";

const roleSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Dê um nome ao perfil.").max(60, "Nome muito longo."),
  description: z
    .string()
    .trim()
    .max(200, "Descrição muito longa.")
    .transform((v) => (v === "" ? null : v)),
  permissions: z.array(z.string().refine(isPermission, "Permissão desconhecida.")),
  requireMfa: z.boolean(),
});

export type RoleInput = z.input<typeof roleSchema>;

function dbError(error: { code?: string; message: string }, fallback: string) {
  if (error.code === "23505") return "Já existe um perfil com esse nome nesta gráfica.";
  // As regras do banco (escalada de privilégio, perfil Administrador) já vêm em português.
  if (error.code === "42501") return error.message;
  return fallback;
}

export async function saveRole(input: RoleInput): Promise<ActionResult> {
  const { membership } = await requireOrg("equipe.gerenciar");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const permissions = expandPermissions(parsed.data.permissions);
  if (!membership.isAdmin && !permissions.every((p) => membership.permissions.includes(p))) {
    return { ok: false, error: "Você não pode liberar permissões que o seu perfil não tem." };
  }

  const supabase = await createClient();
  const values = {
    name: parsed.data.name,
    description: parsed.data.description,
    permissions,
    require_mfa: parsed.data.requireMfa,
  };
  const { error } = parsed.data.id
    ? await supabase
        .from("organization_roles")
        .update(values)
        .eq("id", parsed.data.id)
        .eq("organization_id", membership.organizationId)
    : await supabase
        .from("organization_roles")
        .insert({ ...values, organization_id: membership.organizationId });
  if (error) return { ok: false, error: dbError(error, "Não foi possível salvar o perfil.") };

  revalidatePath(PAGE);
  revalidatePath("/configuracoes/usuarios");
  return { ok: true, message: parsed.data.id ? "Perfil atualizado." : "Perfil criado." };
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("equipe.gerenciar");
  const id = z.uuid().safeParse(roleId);
  if (!id.success) return { ok: false, error: "Perfil inválido." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", membership.organizationId)
    .eq("role_id", id.data);
  if (count) {
    return {
      ok: false,
      error: `${count} ${count === 1 ? "pessoa usa" : "pessoas usam"} este perfil. Troque o perfil delas em Equipe antes de excluir.`,
    };
  }

  const { error } = await supabase
    .from("organization_roles")
    .delete()
    .eq("id", id.data)
    .eq("organization_id", membership.organizationId);
  if (error) return { ok: false, error: dbError(error, "Não foi possível excluir o perfil.") };

  revalidatePath(PAGE);
  return { ok: true, message: "Perfil excluído." };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/dal";
import { createPerson, deletePerson, lookupPerson } from "@/lib/auth/people";
import { createClient } from "@/lib/supabase/server";
import {
  createOrganizationSchema,
  editOrganizationSchema,
  type CreateOrganizationInput,
} from "./schemas";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const PAGE = "/plataforma";

/** Cria a gráfica e o primeiro administrador dela (conta nova ou existente). */
export async function createOrganization(input: CreateOrganizationInput): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const person = await lookupPerson({ username: data.adminUsername, email: data.adminEmail });
  if (person.kind === "username-taken") {
    return { ok: false, error: `O usuário "${data.adminUsername}" já está em uso.` };
  }

  // Gravações com a sessão do SuperAdmin: a auditoria registra quem criou.
  const supabase = await createClient();
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: data.name, slug: data.slug, document: data.document ?? null })
    .select("id")
    .single();
  if (orgError || !org) {
    return {
      ok: false,
      error:
        orgError?.code === "23505"
          ? `O código "${data.slug}" já está em uso.`
          : "Não foi possível criar a gráfica.",
    };
  }

  let userId: string;
  let createdNow = false;
  if (person.kind === "existing") {
    userId = person.userId;
  } else {
    const created = await createPerson({
      username: data.adminUsername,
      fullName: data.adminFullName,
      email: data.adminEmail,
      password: data.adminPassword,
      mustChangePassword: true,
    });
    if ("error" in created) {
      await supabase.from("organizations").update({ active: false }).eq("id", org.id);
      return { ok: false, error: `${created.error} A gráfica ficou desativada; tente de novo.` };
    }
    userId = created.userId;
    createdNow = true;
  }

  // O perfil Administrador é criado automaticamente junto com a gráfica.
  const { data: adminRole } = await supabase
    .from("organization_roles")
    .select("id")
    .eq("organization_id", org.id)
    .eq("is_admin", true)
    .single();
  const { error: memberError } = adminRole
    ? await supabase
        .from("organization_members")
        .insert({ organization_id: org.id, user_id: userId, role_id: adminRole.id })
    : { error: new Error("Perfil Administrador não encontrado.") };
  if (memberError) {
    if (createdNow) await deletePerson(userId);
    await supabase.from("organizations").update({ active: false }).eq("id", org.id);
    return {
      ok: false,
      error: "Não foi possível vincular o administrador. A gráfica ficou desativada.",
    };
  }

  revalidatePath(PAGE);
  return {
    ok: true,
    message:
      person.kind === "existing"
        ? `${data.name} criada. ${person.fullName} já tinha conta e virou admin.`
        : `${data.name} criada com o admin ${data.adminUsername}.`,
  };
}

export async function setOrganizationActive(
  organizationId: string,
  active: boolean,
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const id = z.uuid().safeParse(organizationId);
  if (!id.success) return { ok: false, error: "Gráfica inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ active }).eq("id", id.data);
  if (error) return { ok: false, error: "Não foi possível alterar o status." };

  revalidatePath(PAGE);
  return {
    ok: true,
    message: active ? "Gráfica reativada." : "Gráfica desativada. Os membros perdem o acesso.",
  };
}

/** Nome, razão social, CNPJ e código da gráfica (só a plataforma muda o código). */
export async function updateOrganization(
  organizationId: string,
  input: unknown,
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const id = z.uuid().safeParse(organizationId);
  if (!id.success) return { ok: false, error: "Gráfica inválida." };
  const parsed = editOrganizationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(parsed.data).eq("id", id.data);
  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? `O código "${parsed.data.slug}" já está em uso.`
          : "Não foi possível salvar a gráfica.",
    };
  }
  // O nome aparece no selo do header de todos os membros.
  revalidatePath("/", "layout");
  return { ok: true, message: "Gráfica atualizada." };
}

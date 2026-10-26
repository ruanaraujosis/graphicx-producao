"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import {
  createPerson,
  deletePerson,
  exclusiveMembers,
  lookupPerson,
  recordAudit,
  resetMfa,
  resetPassword,
} from "@/lib/auth/people";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createMemberSchema,
  resetPasswordSchema,
  updateMemberSchema,
  type CreateMemberInput,
  type ResetPasswordInput,
  type UpdateMemberInput,
} from "./schemas";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** As regras do banco (escalada de privilégio etc.) respondem com mensagens prontas (código 42501). */
function dbError(error: { code?: string; message: string }, fallback: string) {
  return error.code === "42501" ? error.message : fallback;
}

const PAGE = "/configuracoes/usuarios";
const NOT_EXCLUSIVE =
  "Esta pessoa também participa de outra gráfica. Ela mesma deve alterar isso em “Meu perfil” ou “Esqueci minha senha”.";

export async function createMember(input: CreateMemberInput): Promise<ActionResult> {
  const { membership } = await requireOrg("equipe.gerenciar");
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { fullName, username, email, roleId, password } = parsed.data;

  const supabase = await createClient();
  const person = await lookupPerson({ username, email });
  if (person.kind === "username-taken") {
    return { ok: false, error: `O usuário "${username}" já está em uso. Escolha outro.` };
  }

  if (person.kind === "existing") {
    const { data: current } = await supabase
      .from("organization_members")
      .select("active")
      .eq("organization_id", membership.organizationId)
      .eq("user_id", person.userId)
      .maybeSingle();
    if (current?.active)
      return { ok: false, error: `${person.fullName} já faz parte desta gráfica.` };

    // O vínculo é gravado com a sessão do admin para a auditoria registrar quem adicionou.
    const { error } = current
      ? await supabase
          .from("organization_members")
          .update({ active: true, role_id: roleId })
          .eq("organization_id", membership.organizationId)
          .eq("user_id", person.userId)
      : await supabase.from("organization_members").insert({
          organization_id: membership.organizationId,
          user_id: person.userId,
          role_id: roleId,
        });
    if (error) return { ok: false, error: dbError(error, "Não foi possível adicionar a pessoa.") };

    revalidatePath(PAGE);
    return {
      ok: true,
      message: `${person.fullName} já tinha conta e foi adicionado(a). A senha dela continua a mesma.`,
    };
  }

  // A senha definida pelo admin é provisória: a pessoa cria a própria no 1º acesso.
  const created = await createPerson({
    username,
    fullName,
    email,
    password,
    mustChangePassword: true,
  });
  if ("error" in created) return { ok: false, error: created.error };

  const { error } = await supabase.from("organization_members").insert({
    organization_id: membership.organizationId,
    user_id: created.userId,
    role_id: roleId,
  });
  if (error) {
    await deletePerson(created.userId);
    return { ok: false, error: dbError(error, "Não foi possível adicionar a pessoa à gráfica.") };
  }

  revalidatePath(PAGE);
  return {
    ok: true,
    message: `${fullName} foi adicionado(a) como ${username}. No primeiro acesso, a pessoa vai criar a própria senha.`,
  };
}

export async function updateMember(input: UpdateMemberInput): Promise<ActionResult> {
  const { session, membership } = await requireOrg("equipe.gerenciar");
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { userId, fullName, roleId, active } = parsed.data;

  if (userId === session.id && (roleId !== membership.roleId || !active)) {
    return {
      ok: false,
      error: "Você não pode alterar o próprio perfil de acesso nem se desativar.",
    };
  }

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("user_id, profiles(full_name)")
    .eq("organization_id", membership.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ok: false, error: "Pessoa não encontrada nesta gráfica." };

  if (member.profiles && member.profiles.full_name !== fullName) {
    const exclusive = await exclusiveMembers(membership.organizationId, [userId]);
    if (!exclusive.has(userId) && userId !== session.id) return { ok: false, error: NOT_EXCLUSIVE };
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId);
    if (error) return { ok: false, error: "Não foi possível salvar o nome." };
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role_id: roleId, active })
    .eq("organization_id", membership.organizationId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: dbError(error, "Não foi possível salvar as alterações.") };

  revalidatePath(PAGE);
  return { ok: true, message: "Alterações salvas." };
}

async function requireExclusiveMember(userId: string) {
  const context = await requireOrg("equipe.gerenciar");
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", context.membership.organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { ...context, error: "Pessoa não encontrada nesta gráfica." };
  const exclusive = await exclusiveMembers(context.membership.organizationId, [userId]);
  if (!exclusive.has(userId)) return { ...context, error: NOT_EXCLUSIVE };
  return { ...context, error: null };
}

export async function resetMemberPassword(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { session, membership, error } = await requireExclusiveMember(parsed.data.userId);
  if (error) return { ok: false, error };

  if (!(await resetPassword(parsed.data.userId, parsed.data.password))) {
    return { ok: false, error: "Não foi possível redefinir a senha." };
  }
  await recordAudit({
    organizationId: membership.organizationId,
    action: "PASSWORD_RESET",
    userId: parsed.data.userId,
    actorId: session.id,
  });
  return {
    ok: true,
    message:
      "Senha provisória definida. Passe pessoalmente: no próximo login a pessoa cria a própria.",
  };
}

export async function resetMemberMfa(userId: string): Promise<ActionResult> {
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, error: "Pessoa inválida." };

  const { session, membership, error } = await requireExclusiveMember(id.data);
  if (error) return { ok: false, error };
  if (id.data === session.id) {
    return { ok: false, error: "Peça a outro administrador para redefinir o seu MFA." };
  }

  if (!(await resetMfa(id.data))) return { ok: false, error: "Não foi possível redefinir o MFA." };
  await recordAudit({
    organizationId: membership.organizationId,
    action: "MFA_RESET",
    userId: id.data,
    actorId: session.id,
  });
  return {
    ok: true,
    message:
      "Verificação em duas etapas redefinida. No próximo login a pessoa cadastra o app de novo.",
  };
}

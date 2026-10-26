import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { usernameToEmail } from "./username";

/**
 * Operações sobre contas (pessoas) que exigem a chave secreta.
 * Só chamar depois de autorizar quem pediu (requireOrg / requirePlatformAdmin).
 */

export type PersonInput = {
  username: string;
  fullName: string;
  email?: string;
  password: string;
  /** Senha definida por outra pessoa: obriga a criar a própria no 1º login. */
  mustChangePassword: boolean;
};

export type PersonLookup =
  | { kind: "existing"; userId: string; fullName: string }
  | { kind: "new" }
  | { kind: "username-taken" };

/** A pessoa já tem conta (mesmo e-mail)? O usuário escolhido está livre? */
export async function lookupPerson(input: {
  username: string;
  email?: string;
}): Promise<PersonLookup> {
  const admin = createAdminClient();
  if (input.email) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("email", input.email)
      .maybeSingle();
    if (data) return { kind: "existing", userId: data.id, fullName: data.full_name };
  }
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("username", input.username)
    .maybeSingle();
  return taken ? { kind: "username-taken" } : { kind: "new" };
}

/** Cria a conta no Auth e o perfil. Desfaz a conta se o perfil falhar. */
export async function createPerson(
  input: PersonInput,
): Promise<{ userId: string } | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email ?? usernameToEmail(input.username),
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return {
      error:
        error?.code === "email_exists"
          ? "Já existe uma conta com este e-mail."
          : "Não foi possível criar o acesso. Verifique a senha e tente novamente.",
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    username: input.username,
    full_name: input.fullName,
    email: input.email ?? null,
    must_change_password: input.mustChangePassword,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Não foi possível salvar o perfil da pessoa." };
  }
  return { userId: data.user.id };
}

/** Desfaz uma conta recém-criada quando o passo seguinte falha. */
export async function deletePerson(userId: string) {
  await createAdminClient().auth.admin.deleteUser(userId);
}

/**
 * Pessoas que trabalham só nesta gráfica (e não são SuperAdmin).
 * Só nelas o admin da gráfica pode trocar senha, MFA e nome — a conta é da pessoa,
 * não da gráfica, e não pode ser controlada por outra empresa.
 */
export async function exclusiveMembers(organizationId: string, userIds: readonly string[]) {
  if (userIds.length === 0) return new Set<string>();
  const admin = createAdminClient();
  const [{ data: elsewhere }, { data: platform }] = await Promise.all([
    admin
      .from("organization_members")
      .select("user_id")
      .in("user_id", [...userIds])
      .neq("organization_id", organizationId),
    admin
      .from("platform_admins")
      .select("user_id")
      .in("user_id", [...userIds]),
  ]);
  const shared = new Set([
    ...(elsewhere ?? []).map((row) => row.user_id),
    ...(platform ?? []).map((row) => row.user_id),
  ]);
  return new Set(userIds.filter((id) => !shared.has(id)));
}

export async function recordAudit(entry: {
  organizationId: string | null;
  action: "PASSWORD_RESET" | "MFA_RESET";
  userId: string;
  actorId: string;
}) {
  await createAdminClient().from("audit_log").insert({
    organization_id: entry.organizationId,
    table_name: "auth.users",
    record_id: entry.userId,
    action: entry.action,
    actor_id: entry.actorId,
  });
}

/** Senha nova definida por um admin: vira provisória (a pessoa cria a própria no próximo login). */
export async function resetPassword(userId: string, password: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return false;
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  return !flagError;
}

export async function clearMustChangePassword(userId: string) {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userId);
  return !error;
}

/** Remove os fatores de MFA; no próximo login a pessoa cadastra o autenticador de novo. */
export async function resetMfa(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) return false;
  for (const factor of data.factors) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (deleteError) return false;
  }
  return true;
}

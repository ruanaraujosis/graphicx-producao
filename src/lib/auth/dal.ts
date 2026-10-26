import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_ORG_COOKIE,
  effectivePermissions,
  requiresMfa,
  resolveActiveMembership,
  type Membership,
} from "./organization";
import { can, type Permission } from "./permissions";

export type Session = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  /** Nível da sessão: aal2 = senha + código do autenticador. */
  aal: "aal1" | "aal2";
  isPlatformAdmin: boolean;
  /** Gráficas ativas em que a pessoa trabalha. */
  memberships: Membership[];
  mfaRequired: boolean;
  /** Senha definida por um admin: precisa criar a própria antes de continuar. */
  mustChangePassword: boolean;
};

/**
 * Camada de acesso a dados: o único ponto que lê a sessão, o perfil e os vínculos.
 * Pessoa sem perfil é tratada como deslogada.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const [profileResult, membersResult, platformResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, full_name, email, must_change_password")
      .eq("id", claims.sub)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select(
        "role_id, organizations(id, slug, name), organization_roles(id, name, is_admin, permissions, require_mfa)",
      )
      .eq("user_id", claims.sub)
      .eq("active", true),
    supabase.from("platform_admins").select("user_id").eq("user_id", claims.sub).maybeSingle(),
  ]);

  const profile = profileResult.data;
  if (!profile) return null;

  const rows = membersResult.data ?? [];
  const isPlatformAdmin = Boolean(platformResult.data);
  const roles = rows.flatMap((row) =>
    row.organization_roles
      ? [
          {
            isAdmin: row.organization_roles.is_admin,
            requireMfa: row.organization_roles.require_mfa,
          },
        ]
      : [],
  );

  // Antes do MFA o banco esconde as gráficas de perfis sensíveis; o próprio perfil, não.
  const memberships: Membership[] = rows.flatMap((row) => {
    const org = row.organizations;
    const role = row.organization_roles;
    if (!org || !role) return [];
    return [
      {
        organizationId: org.id,
        slug: org.slug,
        name: org.name,
        roleId: role.id,
        roleName: role.name,
        isAdmin: role.is_admin,
        permissions: effectivePermissions({
          isAdmin: role.is_admin,
          permissions: role.permissions,
        }),
      },
    ];
  });

  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    email: profile.email,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    isPlatformAdmin,
    memberships,
    mfaRequired: requiresMfa({ isPlatformAdmin, roles }),
    mustChangePassword: profile.must_change_password,
  };
});

/** Logado, com o segundo fator confirmado (se exigido) e com senha própria. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mfaRequired && session.aal !== "aal2") redirect("/mfa");
  if (session.mustChangePassword) redirect("/criar-senha");
  return session;
}

export const getActiveMembership = cache(async (session: Session) => {
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return resolveActiveMembership(session.memberships, preferred);
});

/** Para as telas sem gráfica obrigatória (perfil, plataforma): sessão + gráfica ativa, se houver. */
export async function getShellContext() {
  const session = await requireUser();
  const membership = await getActiveMembership(session);
  return { session, membership };
}

/**
 * Exige uma gráfica ativa e, opcionalmente, uma permissão nela
 * (uma lista = basta ter uma). O Administrador da gráfica tem todas.
 */
export async function requireOrg(required?: Permission | readonly Permission[]) {
  const session = await requireUser();
  const membership = await getActiveMembership(session);

  if (!membership) {
    if (session.memberships.length > 1) redirect("/selecionar-empresa");
    redirect(session.isPlatformAdmin ? "/plataforma" : "/sem-acesso");
  }
  if (required && !can(membership.permissions, required)) redirect("/inicio");

  return { session, membership };
}

export async function requirePlatformAdmin() {
  const session = await requireUser();
  if (!session.isPlatformAdmin) redirect("/inicio");
  return session;
}

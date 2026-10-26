import { ChevronLeft, Crown, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/kit/page-header";
import { requireOrg } from "@/lib/auth/dal";
import {
  ACTION_LABELS,
  ALL_PERMISSIONS,
  PERMISSION_MODULES,
  can,
  expandPermissions,
  roleRequiresMfa,
  type Permission,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { DeleteRoleDialog, RoleDialog, type RoleView } from "./role-dialogs";

export const metadata = { title: "Perfis de acesso" };

export default function PerfisPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/configuracoes"
        className="-mb-2 inline-flex min-h-11 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Configurações
      </Link>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-hidden>
            <div className="h-14 w-64 animate-pulse rounded-xl bg-muted" />
            <div className="grid gap-3 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          </div>
        }
      >
        <RolesContent />
      </Suspense>
    </div>
  );
}

/** Resumo legível: "Pedidos: Gerenciar", "Estoque: Ver"... */
function summarize(perms: readonly Permission[]) {
  return PERMISSION_MODULES.flatMap((module) => {
    if (perms.includes(`${module.key}.gerenciar` as Permission)) {
      return [{ key: module.key, label: module.label, level: ACTION_LABELS.gerenciar }];
    }
    if (perms.includes(`${module.key}.ver` as Permission)) {
      return [{ key: module.key, label: module.label, level: ACTION_LABELS.ver }];
    }
    return [];
  });
}

async function RolesContent() {
  const { membership } = await requireOrg("equipe.ver");
  const canManage = can(membership.permissions, "equipe.gerenciar");
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_roles")
    .select(
      "id, name, description, permissions, is_admin, require_mfa, organization_members(count)",
    )
    .eq("organization_id", membership.organizationId)
    .order("is_admin", { ascending: false })
    .order("name");

  // Quem não é Administrador só concede o que tem e não edita o próprio perfil.
  const grantable = membership.isAdmin ? ALL_PERMISSIONS : membership.permissions;
  const roles = (data ?? []).map((r) => {
    const permissions = r.is_admin ? [...ALL_PERMISSIONS] : expandPermissions(r.permissions);
    const editable =
      canManage &&
      !r.is_admin &&
      (membership.isAdmin ||
        (r.id !== membership.roleId && permissions.every((p) => grantable.includes(p))));
    return {
      view: {
        id: r.id,
        name: r.name,
        description: r.description,
        permissions,
        requireMfa: r.require_mfa,
      } satisfies RoleView,
      isAdmin: r.is_admin,
      members: r.organization_members[0]?.count ?? 0,
      requiresMfa: roleRequiresMfa({ isAdmin: r.is_admin, requireMfa: r.require_mfa }),
      editable,
    };
  });

  return (
    <>
      <PageHeader
        title="Perfis de acesso"
        description={`${membership.name} · escolha o que cada perfil pode ver e gerenciar`}
        actions={canManage ? <RoleDialog grantable={grantable} /> : undefined}
      />

      <ul className="grid gap-3 lg:grid-cols-2">
        {roles.map((role) => (
          <li
            key={role.view.id}
            className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-heading text-base font-semibold">
                  {role.isAdmin && <Crown className="size-4 text-primary" aria-hidden />}
                  {role.view.name}
                </p>
                {role.view.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{role.view.description}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground">
                  <UsersRound className="size-3.5" aria-hidden />
                  {role.members}
                </span>
                {role.requiresMfa && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-full bg-info-soft px-2.5 text-xs font-medium text-info">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    Exige MFA
                  </span>
                )}
              </div>
            </div>

            {role.isAdmin ? (
              <p className="text-sm text-muted-foreground">
                Todas as permissões. Criado automaticamente e não pode ser alterado nem excluído.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Permissões">
                {summarize(role.view.permissions).map((item) => (
                  <li
                    key={item.key}
                    className={
                      item.level === ACTION_LABELS.gerenciar
                        ? "rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
                        : "rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
                    }
                  >
                    {item.label}: {item.level}
                  </li>
                ))}
                {role.view.permissions.length === 0 && (
                  <li className="text-sm text-muted-foreground">Nenhuma permissão ainda.</li>
                )}
              </ul>
            )}

            {role.editable && (
              <div className="flex justify-end gap-1">
                <DeleteRoleDialog role={role.view} members={role.members} />
                <RoleDialog role={role.view} grantable={grantable} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

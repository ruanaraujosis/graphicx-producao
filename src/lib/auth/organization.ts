import { z } from "zod";
import {
  ALL_PERMISSIONS,
  expandPermissions,
  roleRequiresMfa,
  type Permission,
} from "./permissions";

/** Cookie (httpOnly) com a gráfica ativa neste aparelho. Não é usado para autorização. */
export const ACTIVE_ORG_COOKIE = "sp_org";

export type Membership = {
  organizationId: string;
  slug: string;
  name: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  /** Permissões efetivas ("gerenciar" já inclui "ver"; o Administrador tem todas). */
  permissions: Permission[];
};

export function effectivePermissions(role: { isAdmin: boolean; permissions: readonly string[] }) {
  return role.isAdmin ? [...ALL_PERMISSIONS] : expandPermissions(role.permissions);
}

/**
 * Decide em qual gráfica a pessoa está trabalhando:
 * a escolhida no aparelho (se ainda for membro), ou a única que ela tem.
 * Com várias e nenhuma escolhida, retorna null — a interface pergunta.
 */
export function resolveActiveMembership(
  memberships: readonly Membership[],
  preferredOrgId: string | null | undefined,
): Membership | null {
  if (preferredOrgId) {
    const preferred = memberships.find((m) => m.organizationId === preferredOrgId);
    if (preferred) return preferred;
  }
  return memberships.length === 1 ? memberships[0] : null;
}

/** Precisa de MFA quem é SuperAdmin ou tem, em alguma gráfica, perfil que exige MFA. */
export function requiresMfa(input: {
  isPlatformAdmin: boolean;
  roles: readonly { isAdmin: boolean; requireMfa: boolean }[];
}) {
  return input.isPlatformAdmin || input.roles.some(roleRequiresMfa);
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Código muito curto.")
  .max(40, "Código muito longo.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use letras minúsculas, números e hífen (ex.: grafica-centro).",
  );

/** CNPJ da gráfica: validação compartilhada em `@/lib/documents`. */
export { digits as normalizeCnpj, isValidCnpj } from "@/lib/documents";

/**
 * Catálogo de permissões dos perfis configuráveis.
 * Manter igual a `private.valid_permissions()` no banco — há um teste que compara.
 * "gerenciar" sempre inclui "ver".
 */

export type PermissionAction = "ver" | "gerenciar";

export type PermissionModule = {
  key: string;
  label: string;
  description: string;
  actions: readonly PermissionAction[];
};

export const PERMISSION_MODULES = [
  {
    key: "pedidos",
    label: "Pedidos",
    description: "Pedidos de todos os canais e orçamentos.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "artes",
    label: "Artes",
    description: "Provas, versões e aprovação pelo cliente.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "pcp",
    label: "Produção (PCP)",
    description: "Quadro de produção e apontamento de etapas.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "estoque",
    label: "Estoque",
    description: "Produtos, insumos e movimentações.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "expedicao",
    label: "Expedição",
    description: "Etiquetas, despacho e rastreio.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "cadastros",
    label: "Cadastros",
    description: "Clientes, produtos, fichas técnicas e fornecedores.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Contas a receber e a pagar, fluxo de caixa.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "nfe",
    label: "NF-e",
    description: "Consulta, emissão e cancelamento de notas.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "relatorios",
    label: "Relatórios",
    description: "Relatórios gerenciais e exportações.",
    actions: ["ver"],
  },
  {
    key: "equipe",
    label: "Equipe e perfis",
    description: "Pessoas, perfis de acesso e senhas.",
    actions: ["ver", "gerenciar"],
  },
  {
    key: "configuracoes",
    label: "Configurações",
    description: "Dados da gráfica, integrações e TV.",
    actions: ["ver", "gerenciar"],
  },
] as const satisfies readonly PermissionModule[];

type ModuleOf<M> = M extends {
  key: infer K extends string;
  actions: readonly (infer A extends string)[];
}
  ? `${K}.${A}`
  : never;

export type Permission = ModuleOf<(typeof PERMISSION_MODULES)[number]>;

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_MODULES.flatMap((m) =>
  m.actions.map((a) => `${m.key}.${a}` as Permission),
);

/** Permissões que pedem MFA: o formulário de perfil sugere ligar a exigência. */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  "equipe.gerenciar",
  "configuracoes.gerenciar",
  "financeiro.gerenciar",
];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  ver: "Ver",
  gerenciar: "Gerenciar",
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (ALL_PERMISSIONS as readonly string[]).includes(value);
}

/** Aplica "gerenciar inclui ver", remove inválidas e duplicadas, em ordem de catálogo. */
export function expandPermissions(perms: readonly string[]): Permission[] {
  const set = new Set<string>();
  for (const perm of perms) {
    if (!isPermission(perm)) continue;
    set.add(perm);
    if (perm.endsWith(".gerenciar")) set.add(perm.replace(".gerenciar", ".ver"));
  }
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** O perfil exige MFA? O Administrador sempre; os outros, conforme a opção do perfil. */
export function roleRequiresMfa(role: { isAdmin: boolean; requireMfa: boolean }) {
  return role.isAdmin || role.requireMfa;
}

/** Tem alguma permissão sensível (equipe, configurações ou financeiro com "gerenciar")? */
export function hasSensitivePermission(permissions: readonly string[]) {
  return permissions.some((p) => (SENSITIVE_PERMISSIONS as readonly string[]).includes(p));
}

/** `required` pode ser uma permissão ou uma lista (basta ter uma). */
export function can(
  granted: readonly string[] | null | undefined,
  required: Permission | readonly Permission[] | undefined,
) {
  if (!required || (Array.isArray(required) && required.length === 0)) return Boolean(granted);
  if (!granted) return false;
  const list = (Array.isArray(required) ? required : [required]) as readonly Permission[];
  return list.some((perm) => granted.includes(perm));
}

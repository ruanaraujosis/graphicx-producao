import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  can,
  expandPermissions,
  isPermission,
  hasSensitivePermission,
  roleRequiresMfa,
} from "./permissions";

/** Lê a definição mais recente de uma função SQL nas migrations e devolve os textos do array. */
function sqlArray(functionName: string) {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let body: string | undefined;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    const match = sql.match(
      new RegExp(String.raw`function private\.${functionName}\(\)[\s\S]*?\$\$([\s\S]*?)\$\$`),
    );
    if (match) body = match[1];
  }
  if (!body) throw new Error(`Função ${functionName} não encontrada nas migrations`);
  return [...body.matchAll(/'([a-z]+\.[a-z]+)'/g)].map((m) => m[1]);
}

describe("catálogo de permissões", () => {
  it("é idêntico ao do banco (private.valid_permissions)", () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual(sqlArray("valid_permissions").sort());
  });

  it("as permissões sensíveis são as mesmas do banco", () => {
    expect([...SENSITIVE_PERMISSIONS].sort()).toEqual(sqlArray("sensitive_permissions").sort());
  });

  it("reconhece permissões válidas", () => {
    expect(isPermission("pedidos.gerenciar")).toBe(true);
    expect(isPermission("relatorios.gerenciar")).toBe(false);
    expect(isPermission("admin")).toBe(false);
  });
});

describe("expandPermissions", () => {
  it("gerenciar inclui ver e remove o que não existe", () => {
    expect(expandPermissions(["estoque.gerenciar", "xpto.ver", "estoque.gerenciar"])).toEqual([
      "estoque.ver",
      "estoque.gerenciar",
    ]);
  });
});

describe("roleRequiresMfa", () => {
  it("o Administrador sempre exige", () => {
    expect(roleRequiresMfa({ isAdmin: true, requireMfa: false })).toBe(true);
  });
  it("os outros perfis seguem a opção do perfil", () => {
    expect(roleRequiresMfa({ isAdmin: false, requireMfa: true })).toBe(true);
    expect(roleRequiresMfa({ isAdmin: false, requireMfa: false })).toBe(false);
  });
});

describe("hasSensitivePermission", () => {
  it.each(SENSITIVE_PERMISSIONS)("sugere MFA para quem tem %s", (perm) => {
    expect(hasSensitivePermission([perm])).toBe(true);
  });
  it("não sugere para perfis operacionais", () => {
    expect(hasSensitivePermission(["pedidos.gerenciar", "financeiro.ver"])).toBe(false);
  });
});

describe("can", () => {
  it("basta uma da lista", () => {
    expect(can(["nfe.ver"], ["financeiro.ver", "nfe.ver"])).toBe(true);
    expect(can(["pedidos.ver"], ["financeiro.ver", "nfe.ver"])).toBe(false);
  });
  it("sem exigência, basta estar numa gráfica", () => {
    expect(can([], undefined)).toBe(true);
    expect(can(null, undefined)).toBe(false);
  });
});

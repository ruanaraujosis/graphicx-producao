import { describe, expect, it } from "vitest";
import {
  effectivePermissions,
  isValidCnpj,
  requiresMfa,
  resolveActiveMembership,
  slugSchema,
  type Membership,
} from "./organization";

const centro: Membership = {
  organizationId: "a",
  slug: "centro",
  name: "Gráfica Centro",
  roleId: "r1",
  roleName: "Administrador",
  isAdmin: true,
  permissions: [],
};
const norte: Membership = {
  organizationId: "b",
  slug: "norte",
  name: "Gráfica Norte",
  roleId: "r2",
  roleName: "Produção",
  isAdmin: false,
  permissions: ["pcp.ver", "pcp.gerenciar"],
};

describe("resolveActiveMembership", () => {
  it("entra direto quando a pessoa só tem uma gráfica", () => {
    expect(resolveActiveMembership([centro], null)).toBe(centro);
  });

  it("usa a gráfica escolhida no aparelho", () => {
    expect(resolveActiveMembership([centro, norte], "b")).toBe(norte);
  });

  it("pede para escolher quando há várias e nenhuma escolhida", () => {
    expect(resolveActiveMembership([centro, norte], null)).toBeNull();
  });

  it("ignora cookie de uma gráfica da qual a pessoa não é (mais) membro", () => {
    expect(resolveActiveMembership([centro, norte], "outra")).toBeNull();
    expect(resolveActiveMembership([norte], "a")).toBe(norte);
  });

  it("sem vínculos não há gráfica", () => {
    expect(resolveActiveMembership([], "a")).toBeNull();
  });
});

const producao = { isAdmin: false, requireMfa: false };
const admin = { isAdmin: true, requireMfa: true };
const gestorEquipe = { isAdmin: false, requireMfa: true };

describe("requiresMfa", () => {
  it("exige para quem é Administrador em alguma gráfica", () => {
    expect(requiresMfa({ isPlatformAdmin: false, roles: [producao, admin] })).toBe(true);
  });
  it("exige para perfis com a exigência ligada", () => {
    expect(requiresMfa({ isPlatformAdmin: false, roles: [gestorEquipe] })).toBe(true);
  });
  it("exige para SuperAdmin", () => {
    expect(requiresMfa({ isPlatformAdmin: true, roles: [] })).toBe(true);
  });
  it("não exige para perfis operacionais", () => {
    expect(requiresMfa({ isPlatformAdmin: false, roles: [producao] })).toBe(false);
  });
});

describe("effectivePermissions", () => {
  it("Administrador tem todas; os demais têm as do perfil, com gerenciar incluindo ver", () => {
    expect(effectivePermissions({ isAdmin: true, permissions: [] }).length).toBeGreaterThan(10);
    expect(effectivePermissions({ isAdmin: false, permissions: ["pcp.gerenciar"] })).toEqual([
      "pcp.ver",
      "pcp.gerenciar",
    ]);
  });
});

describe("slugSchema", () => {
  it("aceita códigos simples", () => {
    expect(slugSchema.parse(" Grafica-Centro ")).toBe("grafica-centro");
  });
  it.each(["a", "gráfica", "com espaço", "-inicio", "fim-", "duplo--hifen"])("recusa %s", (v) => {
    expect(slugSchema.safeParse(v).success).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ válido com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("recusa dígito verificador errado e sequências repetidas", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });
});

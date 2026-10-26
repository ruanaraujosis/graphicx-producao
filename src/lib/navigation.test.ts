import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type Permission } from "./auth/permissions";
import {
  BOTTOM_NAV_LIMIT,
  NAV_ITEMS,
  isActivePath,
  navItemsFor,
  splitBottomNav,
} from "./navigation";

const hrefs = (permissions: readonly Permission[] | null, isPlatformAdmin = false) =>
  navItemsFor({ permissions, isPlatformAdmin }).map((item) => item.href);

describe("navItemsFor", () => {
  it("Administrador (todas as permissões) vê todos os módulos da gráfica", () => {
    expect(hrefs(ALL_PERMISSIONS)).toEqual(
      NAV_ITEMS.filter((item) => item.scope === "org").map((item) => item.href),
    );
  });

  it("qualquer membro vê o Início, mesmo sem permissões", () => {
    expect(hrefs([])).toEqual(["/inicio"]);
  });

  it("mostra só os módulos liberados no perfil", () => {
    // Quem vê pedidos também vê Cadastros (para consultar os clientes).
    expect(hrefs(["pedidos.ver", "artes.ver", "artes.gerenciar"])).toEqual([
      "/inicio",
      "/pedidos",
      "/artes",
      "/cadastros",
    ]);
    expect(hrefs(["artes.ver"])).toEqual(["/inicio", "/artes"]);
  });

  it("Financeiro aparece com qualquer permissão financeira", () => {
    expect(hrefs(["relatorios.ver"])).toContain("/financeiro");
  });

  it("Configurações aparece para quem vê a equipe ou as configurações", () => {
    expect(hrefs(["equipe.ver"])).toContain("/configuracoes");
    expect(hrefs(["pedidos.ver"])).not.toContain("/configuracoes");
  });

  it("sem gráfica ativa não vê módulos", () => {
    expect(hrefs(null)).toEqual([]);
  });

  it("Plataforma só aparece para o SuperAdmin", () => {
    expect(hrefs(ALL_PERMISSIONS)).not.toContain("/plataforma");
    expect(hrefs(null, true)).toEqual(["/plataforma"]);
  });
});

describe("splitBottomNav", () => {
  it("não cria 'Mais' quando todos os itens cabem", () => {
    const items = NAV_ITEMS.slice(0, BOTTOM_NAV_LIMIT + 1);
    expect(splitBottomNav(items).overflow).toEqual([]);
  });

  it("move o excedente para 'Mais'", () => {
    const { primary, overflow } = splitBottomNav(NAV_ITEMS);
    expect(primary).toHaveLength(BOTTOM_NAV_LIMIT);
    expect(primary.length + overflow.length).toBe(NAV_ITEMS.length);
  });
});

describe("isActivePath", () => {
  it("marca subpáginas", () => {
    expect(isActivePath("/configuracoes/usuarios", "/configuracoes")).toBe(true);
  });
  it("não confunde prefixos", () => {
    expect(isActivePath("/pedidos-antigos", "/pedidos")).toBe(false);
  });
});

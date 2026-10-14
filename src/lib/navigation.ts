import {
  Boxes,
  Building2,
  Contact,
  House,
  Palette,
  Settings,
  ShoppingBag,
  SquareKanban,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** "org": módulo da gráfica ativa; "platform": só para o SuperAdmin. */
  scope: "org" | "platform";
  /** Permissão (na gráfica ativa) para ver o item; lista = basta uma. Sem = qualquer membro. */
  permission?: Permission | readonly Permission[];
  /** Módulo ainda não liberado: aparece como "em breve". */
  comingSoon?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/inicio", label: "Início", icon: House, scope: "org" },
  {
    href: "/pedidos",
    label: "Pedidos",
    icon: ShoppingBag,
    scope: "org",
    permission: "pedidos.ver",
  },
  {
    href: "/artes",
    label: "Artes",
    icon: Palette,
    scope: "org",
    permission: "artes.ver",
  },
  {
    href: "/pcp",
    label: "Produção",
    icon: SquareKanban,
    scope: "org",
    permission: "pcp.ver",
  },
  {
    href: "/estoque",
    label: "Estoque",
    icon: Boxes,
    scope: "org",
    permission: "estoque.ver",
  },
  {
    href: "/expedicao",
    label: "Expedição",
    icon: Truck,
    scope: "org",
    permission: "expedicao.ver",
  },
  {
    href: "/cadastros",
    label: "Cadastros",
    icon: Contact,
    scope: "org",
    permission: ["cadastros.ver", "pedidos.ver", "estoque.ver", "financeiro.ver"],
  },
  {
    href: "/financeiro",
    label: "Financeiro",
    icon: Wallet,
    scope: "org",
    permission: ["financeiro.ver", "nfe.ver", "relatorios.ver"],
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    scope: "org",
    permission: ["equipe.ver", "configuracoes.ver"],
  },
  { href: "/plataforma", label: "Plataforma", icon: Building2, scope: "platform" },
];

export type NavContext = {
  /** Permissões na gráfica ativa (null = nenhuma gráfica selecionada). */
  permissions: readonly Permission[] | null | undefined;
  isPlatformAdmin?: boolean;
};

export function navItemsFor({ permissions, isPlatformAdmin = false }: NavContext) {
  return NAV_ITEMS.filter((item) => {
    if (item.scope === "platform") return isPlatformAdmin;
    if (!permissions) return false;
    return !item.permission || can(permissions, item.permission);
  });
}

export function findNavItem(href: string) {
  return NAV_ITEMS.find((item) => item.href === href);
}

/** No celular cabem 4 atalhos na barra inferior; o resto vai para "Mais". */
export const BOTTOM_NAV_LIMIT = 4;

export function splitBottomNav(items: readonly NavItem[]) {
  if (items.length <= BOTTOM_NAV_LIMIT + 1) return { primary: [...items], overflow: [] };
  return {
    primary: items.slice(0, BOTTOM_NAV_LIMIT),
    overflow: items.slice(BOTTOM_NAV_LIMIT),
  };
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

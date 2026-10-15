/** Telas do painel da TV que dá para "reproduzir" a partir do GraphicX. */
export const TV_SCREENS = {
  board: "Produção agora",
  due: "Postagens e prazos",
  art: "Artes aguardando aprovação",
  revenue: "Faturamento",
  channels: "Vendas por canal",
  stock: "Estoque crítico",
} as const;

export type TvScreen = keyof typeof TV_SCREENS;

/** Tela da TV que corresponde à página aberta (nulo = a TV gira entre todas). */
export function screenForPath(pathname: string): TvScreen | null {
  const first = pathname.split("/")[1] ?? "";
  switch (first) {
    case "pcp":
    case "inicio":
      return "board";
    case "pedidos":
    case "expedicao":
      return "due";
    case "artes":
      return "art";
    case "financeiro":
      return "revenue";
    case "estoque":
      return "stock";
    default:
      return null;
  }
}

export function isTvScreen(value: unknown): value is TvScreen {
  return typeof value === "string" && value in TV_SCREENS;
}

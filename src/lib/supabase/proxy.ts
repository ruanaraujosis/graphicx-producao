import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Rotas acessíveis sem login. */
const PUBLIC_PATHS = [
  "/login",
  "/esqueci-senha",
  "/auth/confirm",
  // Link do cliente para enviar arte e aprovar a prova (token no caminho).
  "/a",
  // Painel da TV (token de dispositivo no caminho, só leitura) e a tela de conectar com código.
  "/tv",
  "/api/tv/pareamento",
  // Avisos dos marketplaces (assinatura conferida na rota) e o processador da fila (segredo).
  "/api/marketplaces/shopee/webhook",
  "/api/marketplaces/worker",
  // Rotina diária de backup por gráfica (Vercel Cron, com segredo).
  "/api/plataforma/backups",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Renova o token do Supabase a cada requisição e faz a checagem otimista de
 * login. A autorização de verdade acontece na camada de dados (DAL + RLS).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Não colocar código entre a criação do cliente e getClaims(): é aqui que a sessão é renovada.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithCookies(url, response);
  }

  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

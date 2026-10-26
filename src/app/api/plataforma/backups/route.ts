import type { NextRequest } from "next/server";
import { runDailyBackups } from "@/lib/backups/organization-backup";
import { sameSecret } from "@/lib/marketplaces/oauth";

export const maxDuration = 60;

/**
 * Rotina diária de backup por gráfica (Vercel Cron, ver vercel.json).
 * A Vercel envia o CRON_SECRET no cabeçalho Authorization.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32)
    return new Response("Rotina não configurada.", { status: 503 });
  if (!sameSecret(`Bearer ${secret}`, request.headers.get("authorization") ?? ""))
    return new Response("Não autorizado.", { status: 401 });
  return Response.json(await runDailyBackups());
}

import type { NextRequest } from "next/server";
import { sameSecret } from "@/lib/marketplaces/oauth";
import { processJobs } from "@/lib/marketplaces/worker";

export const maxDuration = 60;

/** O relógio do banco (pg_cron) chama esta rota com o segredo do processador. */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  return sameSecret(`Bearer ${secret}`, request.headers.get("authorization") ?? "");
}

/** Processador da fila das integrações. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return new Response("Não autorizado.", { status: 401 });
  const result = await processJobs(20);
  return Response.json(result);
}

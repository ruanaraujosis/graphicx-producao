"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ART_BUCKET, MAX_ART_FILE_BYTES, artPath } from "@/lib/art/files";
import type { ActionResult } from "@/lib/crud";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, isTokenFormat } from "./link";

/**
 * Ações do link público (sem login). Quem autoriza é o token: o banco confere
 * se o link existe, não foi revogado e não venceu. A chave secreta só é usada
 * depois disso e sempre filtrando pelo pedido do link.
 */

async function guard(token: string, bucket: string, limit: number) {
  if (!isTokenFormat(token)) return { ok: false as const, error: "Link inválido." };
  const ip = clientIp(await headers());
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_key: `${bucket}:${ip}`,
    p_limit: limit,
    p_window_seconds: 600,
  });
  if (allowed === false) {
    return {
      ok: false as const,
      error: "Muitas tentativas. Espere alguns minutos e tente de novo.",
    };
  }
  return { ok: true as const, admin, ip };
}

const fileSchema = z.object({
  fileName: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_ART_FILE_BYTES, "Arquivo grande demais (máximo 50 MB)."),
  mime: z.string().max(120),
});

/** Gera a URL assinada para o navegador enviar o arquivo direto ao Storage. */
export async function prepareClientUpload(
  token: string,
  input: unknown,
): Promise<ActionResult<{ path: string; uploadToken: string }>> {
  const g = await guard(token, "arte-envio", 40);
  if (!g.ok) return g;
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Arquivo inválido." };

  const { data: link } = await g.admin.rpc("resolve_art_link", { p_token: token }).maybeSingle();
  if (!link) return { ok: false, error: "Link inválido ou expirado." };

  const path = artPath(link.organization_id, link.order_id, "cliente", parsed.data.fileName);
  const { data, error } = await g.admin.storage.from(ART_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Não foi possível preparar o envio." };
  return { ok: true, message: "", data: { path: data.path, uploadToken: data.token } };
}

/** Registra o arquivo depois que o navegador terminou o envio. */
export async function confirmClientUpload(
  token: string,
  input: { path: string; fileName: string; size: number; mime: string; note?: string },
): Promise<ActionResult> {
  const g = await guard(token, "arte-envio", 40);
  if (!g.ok) return g;
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };

  const { data: exists } = await g.admin.storage.from(ART_BUCKET).exists(input.path);
  if (!exists) return { ok: false, error: "O arquivo não chegou. Tente enviar de novo." };

  const { error } = await g.admin.rpc("register_client_art_file", {
    p_token: token,
    p_path: input.path,
    p_file_name: parsed.data.fileName.slice(0, 200),
    p_size: parsed.data.size,
    p_mime: parsed.data.mime || "application/octet-stream",
    p_note: input.note?.slice(0, 1000) || null,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "42501" ? error.message : "Não foi possível registrar o arquivo.",
    };
  }
  revalidatePath(`/a/${token}`);
  return { ok: true, message: "Arquivo recebido! A gráfica já foi avisada." };
}

const reviewSchema = z
  .object({
    versionId: z.uuid(),
    decision: z.enum(["aprovada", "alteracao"]),
    comment: z.string().trim().max(2000).optional(),
    name: z.string().trim().max(120).optional(),
    pins: z
      .array(
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          n: z.number().int().min(1).max(30),
        }),
      )
      .max(30)
      .default([]),
  })
  .refine((v) => v.decision === "aprovada" || (v.comment && v.comment.length >= 3), {
    message: "Conte o que precisa mudar.",
    path: ["comment"],
  });

export async function submitReview(token: string, input: unknown): Promise<ActionResult> {
  const g = await guard(token, "arte-resposta", 20);
  if (!g.ok) return g;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Resposta inválida." };
  const v = parsed.data;

  const userAgent = (await headers()).get("user-agent")?.slice(0, 500) ?? null;
  const { error } = await g.admin.rpc("submit_art_review", {
    p_token: token,
    p_version_id: v.versionId,
    p_decision: v.decision,
    p_comment: v.comment || null,
    p_pins: v.pins,
    p_reviewer_name: v.name || null,
    p_ip: g.ip === "desconhecido" ? null : g.ip,
    p_user_agent: userAgent,
  });
  if (error) {
    const known = ["42501", "P0002", "23514", "22023"].includes(error.code ?? "");
    return { ok: false, error: known ? error.message : "Não foi possível registrar sua resposta." };
  }
  revalidatePath(`/a/${token}`);
  return {
    ok: true,
    message:
      v.decision === "aprovada"
        ? "Arte aprovada! Seu pedido seguiu para a produção."
        : "Pedido de alteração enviado. Você recebe uma nova prova em breve.",
  };
}

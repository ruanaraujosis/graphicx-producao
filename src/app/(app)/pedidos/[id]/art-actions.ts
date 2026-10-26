"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ART_BUCKET,
  MAX_ART_FILE_BYTES,
  MAX_PROOF_BYTES,
  artPath,
  isArtPathOf,
  isProofMime,
  type ArtFolder,
} from "@/lib/art/files";
import { watermarkImage, watermarkPdf } from "@/lib/art/watermark";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { orderNumber } from "@/lib/orders/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MANAGE = ["pedidos.gerenciar", "artes.gerenciar"] as const;

/** Pedido da gráfica ativa (o RLS também filtra). */
async function loadOrder(orderId: string) {
  const { membership } = await requireOrg([...MANAGE]);
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, number, organization_id")
    .eq("id", orderId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  return { membership, supabase, order };
}

export async function createArtLink(orderId: string): Promise<ActionResult<{ token: string }>> {
  const { supabase, order } = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  const { data, error } = await supabase
    .from("art_links")
    .insert({ organization_id: order.organization_id, order_id: order.id })
    .select("token")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error
        ? dbErrorMessage(error, { fallback: "Não foi possível gerar o link." })
        : "Erro.",
    };
  }
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true, message: "Link gerado.", data: { token: data.token } };
}

export async function revokeArtLink(orderId: string, linkId: string): Promise<ActionResult> {
  const { supabase, order } = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  const { error } = await supabase
    .from("art_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("order_id", order.id);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível revogar." }) };
  revalidatePath(`/pedidos/${orderId}`);
  return { ok: true, message: "Link desativado. O cliente não consegue mais abrir." };
}

const uploadSchema = z.object({
  orderId: z.uuid(),
  folder: z.enum(["cliente", "provas", "final"]),
  fileName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mime: z.string().max(120),
});

/** Devolve o caminho onde o navegador deve enviar o arquivo (o RLS do Storage confere a permissão). */
export async function prepareArtUpload(input: unknown): Promise<ActionResult<{ path: string }>> {
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Arquivo inválido." };
  const { orderId, folder, fileName, size, mime } = parsed.data;
  if (folder === "provas" && !isProofMime(mime)) {
    return { ok: false, error: "A prova precisa ser JPG, PNG, WebP ou PDF." };
  }
  const limit = folder === "provas" ? MAX_PROOF_BYTES : MAX_ART_FILE_BYTES;
  if (size > limit) {
    return { ok: false, error: `Arquivo grande demais (máximo ${limit / 1024 / 1024} MB).` };
  }
  const { order } = await loadOrder(orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  return {
    ok: true,
    message: "",
    data: { path: artPath(order.organization_id, order.id, folder as ArtFolder, fileName) },
  };
}

/**
 * Transforma o arquivo enviado em prova: reduz, aplica a marca d'água, guarda
 * a versão (v1, v2…) e apaga o original. O cliente só vê a prova marcada.
 */
export async function publishProof(input: {
  orderId: string;
  path: string;
  mime: string;
  note?: string;
}): Promise<ActionResult> {
  const { membership } = await requireOrg("artes.gerenciar");
  const { supabase, order } = await loadOrder(input.orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (
    !isArtPathOf(input.path, order.organization_id, order.id, "provas") ||
    !isProofMime(input.mime)
  ) {
    return { ok: false, error: "Arquivo de prova inválido." };
  }

  const admin = createAdminClient();
  const { data: blob, error: downloadError } = await supabase.storage
    .from(ART_BUCKET)
    .download(input.path);
  if (downloadError || !blob)
    return { ok: false, error: "Não foi possível ler o arquivo enviado." };
  if (blob.size > MAX_PROOF_BYTES) {
    await admin.storage.from(ART_BUCKET).remove([input.path]);
    return { ok: false, error: "Arquivo grande demais para prova (máximo 25 MB)." };
  }

  const source = Buffer.from(await blob.arrayBuffer());
  const isPdf = input.mime === "application/pdf";
  let marked: Buffer;
  try {
    marked = isPdf
      ? await watermarkPdf(
          source,
          `PROVA · Pedido ${orderNumber(order.number)} · ${membership.name}`,
        )
      : await watermarkImage(source, `PROVA ${orderNumber(order.number)}`);
  } catch (e) {
    await admin.storage.from(ART_BUCKET).remove([input.path]);
    return {
      ok: false,
      error:
        e instanceof Error && e.message.startsWith("Não")
          ? e.message
          : "Não foi possível processar a prova.",
    };
  }

  const proofPath = artPath(
    order.organization_id,
    order.id,
    "provas",
    isPdf ? "prova.pdf" : "prova.jpg",
  );
  const proofMime = isPdf ? "application/pdf" : "image/jpeg";
  const { error: uploadError } = await supabase.storage
    .from(ART_BUCKET)
    .upload(proofPath, marked, { contentType: proofMime, upsert: false });
  // O original sem marca não fica guardado.
  await admin.storage.from(ART_BUCKET).remove([input.path]);
  if (uploadError) return { ok: false, error: "Não foi possível salvar a prova." };

  const { error } = await supabase.from("art_versions").insert({
    organization_id: order.organization_id,
    order_id: order.id,
    proof_path: proofPath,
    proof_mime: proofMime,
    note: input.note?.trim() || null,
  });
  if (error) {
    await admin.storage.from(ART_BUCKET).remove([proofPath]);
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível registrar a prova." }),
    };
  }
  revalidatePath(`/pedidos/${order.id}`);
  revalidatePath("/artes");
  revalidatePath("/pcp");
  return { ok: true, message: "Prova enviada. O pedido foi para Aguardando Aprovação." };
}

/** Arquivo final em alta resolução (só a equipe vê). */
export async function attachFinalFile(input: {
  orderId: string;
  versionId: string;
  path: string;
  fileName: string;
}): Promise<ActionResult> {
  await requireOrg("artes.gerenciar");
  const { supabase, order } = await loadOrder(input.orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (!isArtPathOf(input.path, order.organization_id, order.id, "final")) {
    return { ok: false, error: "Arquivo inválido." };
  }
  const { error } = await supabase
    .from("art_versions")
    .update({ final_path: input.path, final_name: input.fileName.slice(0, 200) })
    .eq("id", input.versionId)
    .eq("order_id", order.id);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível anexar." }) };
  revalidatePath(`/pedidos/${order.id}`);
  return { ok: true, message: "Arquivo final anexado." };
}

/** Arquivo do cliente recebido por outro meio (WhatsApp, e-mail) e anexado pela equipe. */
export async function attachClientFile(input: {
  orderId: string;
  path: string;
  fileName: string;
  size: number;
  mime: string;
}): Promise<ActionResult> {
  const { supabase, order } = await loadOrder(input.orderId);
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (!isArtPathOf(input.path, order.organization_id, order.id, "cliente")) {
    return { ok: false, error: "Arquivo inválido." };
  }
  const { error } = await supabase.from("art_files").insert({
    organization_id: order.organization_id,
    order_id: order.id,
    path: input.path,
    file_name: input.fileName.slice(0, 200),
    size_bytes: input.size,
    mime_type: input.mime.slice(0, 120) || null,
  });
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível anexar." }) };
  revalidatePath(`/pedidos/${order.id}`);
  return { ok: true, message: "Arquivo anexado." };
}

/** Link temporário (10 min) para baixar um arquivo de arte. O RLS do Storage decide quem pode. */
export async function artDownloadUrl(
  path: string,
  fileName?: string,
): Promise<ActionResult<{ url: string }>> {
  await requireOrg(["pedidos.ver", "artes.ver", "pcp.ver"]);
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(ART_BUCKET)
    .createSignedUrl(path, 600, fileName ? { download: fileName } : undefined);
  if (error || !data) return { ok: false, error: "Arquivo indisponível." };
  return { ok: true, message: "", data: { url: data.signedUrl } };
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { DEFAULT_REPLY_TEMPLATES } from "@/lib/marketplaces/replies";
import { admin } from "@/lib/marketplaces/store";
import { processJobs } from "@/lib/marketplaces/worker";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/marketing";
const UUID = /^[0-9a-f-]{36}$/i;

/** Loja da gráfica ativa (conferida pela sessão/RLS antes de usar a chave secreta). */
async function ownShop(shopId: string) {
  const { membership } = await requireOrg("marketing.gerenciar");
  if (!UUID.test(shopId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_shops")
    .select("id, organization_id")
    .eq("id", shopId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  return data ? { shop: data, supabase } : null;
}

async function enqueue(
  shopId: string,
  kind: string,
  payload: Record<string, string> = {},
  dedupe = kind,
) {
  await admin().rpc("marketplace_enqueue", {
    p_shop: shopId,
    p_kind: kind,
    p_payload: payload,
    p_dedupe: dedupe,
  });
  after(() => processJobs(10).catch(() => undefined));
}

// -----------------------------------------------------------------------------
// Ajustes da loja
// -----------------------------------------------------------------------------
const settingsSchema = z.object({
  boost_enabled: z.boolean(),
  review_auto_reply: z.boolean(),
  review_signature: z.string().trim().max(60, "Assinatura com até 60 caracteres."),
});

export async function saveMarketingSettings(shopId: string, input: unknown): Promise<ActionResult> {
  const owned = await ownShop(shopId);
  if (!owned) return { ok: false, error: "Loja não encontrada." };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { error } = await owned.supabase.rpc("marketing_shop_settings", {
    p_shop: shopId,
    p_boost_enabled: parsed.data.boost_enabled,
    p_review_auto_reply: parsed.data.review_auto_reply,
    p_review_signature: parsed.data.review_signature || null,
  });
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  if (parsed.data.boost_enabled) await enqueue(shopId, "boost.run");
  revalidatePath(PAGE);
  return { ok: true, message: "Ajustes de marketing salvos." };
}

// -----------------------------------------------------------------------------
// Impulsionamento
// -----------------------------------------------------------------------------
export async function addBoostItem(shopId: string, externalItemId: string): Promise<ActionResult> {
  const owned = await ownShop(shopId);
  if (!owned) return { ok: false, error: "Loja não encontrada." };
  if (!/^\d{1,40}$/.test(externalItemId)) return { ok: false, error: "Anúncio inválido." };
  const { supabase, shop } = owned;
  const [{ data: listing }, { data: last }] = await Promise.all([
    supabase
      .from("marketplace_listings")
      .select("title")
      .eq("shop_id", shopId)
      .eq("external_item_id", externalItemId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("marketplace_boost_items")
      .select("position")
      .eq("shop_id", shopId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { error } = await supabase.from("marketplace_boost_items").insert({
    organization_id: shop.organization_id,
    shop_id: shopId,
    external_item_id: externalItemId,
    // Variações vêm como "Título — Opção": a lista mostra só o anúncio.
    title: listing?.title?.split(" — ")[0] ?? null,
    position: (last?.position ?? 0) + 1,
  });
  if (error)
    return {
      ok: false,
      error: dbErrorMessage(error, {
        unique: "Este anúncio já está na lista.",
        fallback: "Não foi possível adicionar.",
      }),
    };
  revalidatePath(PAGE);
  return { ok: true, message: "Anúncio adicionado ao fim da lista." };
}

/** Sobe ou desce o anúncio na prioridade (troca com o vizinho). */
export async function moveBoostItem(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  if (!UUID.test(id)) return { ok: false, error: "Item inválido." };
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("marketplace_boost_items")
    .select("id, shop_id, position")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Item não encontrado." };
  const { data: neighbor } = await supabase
    .from("marketplace_boost_items")
    .select("id, position")
    .eq("shop_id", item.shop_id)
    [direction === "up" ? "lt" : "gt"]("position", item.position)
    .order("position", { ascending: direction === "down" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return { ok: true, message: "Já está na ponta da lista." };
  await supabase
    .from("marketplace_boost_items")
    .update({ position: neighbor.position })
    .eq("id", item.id);
  await supabase
    .from("marketplace_boost_items")
    .update({ position: item.position })
    .eq("id", neighbor.id);
  revalidatePath(PAGE);
  return { ok: true, message: "Prioridade atualizada." };
}

export async function toggleBoostItem(id: string, active: boolean): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_boost_items")
    .update({ active })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error) return { ok: false, error: "Não foi possível alterar." };
  revalidatePath(PAGE);
  return {
    ok: true,
    message: active ? "Anúncio volta a ser impulsionado." : "Anúncio pausado na lista.",
  };
}

export async function removeBoostItem(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_boost_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error) return { ok: false, error: "Não foi possível remover." };
  revalidatePath(PAGE);
  return { ok: true, message: "Anúncio removido da lista." };
}

// -----------------------------------------------------------------------------
// Avaliações
// -----------------------------------------------------------------------------
export async function sendReviewReply(reviewId: string, text: string): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const reply = text.trim();
  if (reply.length < 2) return { ok: false, error: "Escreva a resposta." };
  if (reply.length > 500) return { ok: false, error: "A resposta tem até 500 caracteres." };
  const supabase = await createClient();
  const { data: review, error } = await supabase
    .from("marketplace_reviews")
    .update({ reply_text: reply, status: "enviando" })
    .eq("id", reviewId)
    .eq("organization_id", membership.organizationId)
    .in("status", ["pendente", "erro"])
    .select("id, shop_id")
    .maybeSingle();
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível enviar." }) };
  if (!review) return { ok: false, error: "Esta avaliação já foi respondida ou ignorada." };
  await enqueue(review.shop_id, "reviews.reply", { review_id: review.id }, `reply:${review.id}`);
  revalidatePath(PAGE);
  return { ok: true, message: "Resposta enviada para a Shopee." };
}

export async function ignoreReview(reviewId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_reviews")
    .update({ status: "ignorada" })
    .eq("id", reviewId)
    .eq("organization_id", membership.organizationId)
    .in("status", ["pendente", "erro"]);
  if (error) return { ok: false, error: "Não foi possível ignorar." };
  revalidatePath(PAGE);
  return { ok: true, message: "Avaliação marcada como ignorada." };
}

export async function syncReviewsNow(shopId: string): Promise<ActionResult> {
  const owned = await ownShop(shopId);
  if (!owned) return { ok: false, error: "Loja não encontrada." };
  await enqueue(shopId, "reviews.import");
  return { ok: true, message: "Buscando avaliações novas. Atualize em instantes." };
}

// -----------------------------------------------------------------------------
// Modelos de resposta
// -----------------------------------------------------------------------------
const templateSchema = z
  .object({
    min_stars: z.coerce.number().int().min(1).max(5),
    max_stars: z.coerce.number().int().min(1).max(5),
    body: z.string().trim().min(5, "Escreva o texto da resposta.").max(500, "Até 500 caracteres."),
  })
  .refine((v) => v.min_stars <= v.max_stars, {
    path: ["max_stars"],
    message: "A faixa precisa ir da menor para a maior nota.",
  });

export async function saveReplyTemplate(id: string | null, input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("marketplace_reply_templates")
        .update(parsed.data)
        .eq("id", id)
        .eq("organization_id", membership.organizationId)
    : await supabase
        .from("marketplace_reply_templates")
        .insert({ ...parsed.data, organization_id: membership.organizationId });
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  revalidatePath(PAGE);
  return { ok: true, message: "Modelo salvo." };
}

export async function deleteReplyTemplate(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_reply_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error) return { ok: false, error: "Não foi possível excluir." };
  revalidatePath(PAGE);
  return { ok: true, message: "Modelo excluído." };
}

/** Copia os modelos padrão para a gráfica poder editar. */
export async function customizeDefaultTemplates(): Promise<ActionResult> {
  const { membership } = await requireOrg("marketing.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_reply_templates")
    .insert(
      DEFAULT_REPLY_TEMPLATES.map((t) => ({ ...t, organization_id: membership.organizationId })),
    );
  if (error) return { ok: false, error: "Não foi possível copiar os modelos." };
  revalidatePath(PAGE);
  return { ok: true, message: "Modelos copiados. Agora é só editar." };
}

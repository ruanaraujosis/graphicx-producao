"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { admin } from "@/lib/marketplaces/store";
import { processJobs } from "@/lib/marketplaces/worker";
import { createClient } from "@/lib/supabase/server";
import { shopSettingsSchema } from "./schema";

const PAGE = "/configuracoes/integracoes";

export async function saveShopSettings(id: string, input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const parsed = shopSettingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketplace_shops")
    .update({
      name: v.name,
      stock_ratio: v.stock_pct / 100,
      chat_message_enabled: v.chat_message_enabled,
      chat_template: v.chat_template,
      price_sync_enabled: v.price_sync_enabled,
      ship_mode: v.ship_mode,
    })
    .eq("id", id)
    .eq("organization_id", membership.organizationId);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  // Margem ou envio de preços mudou: confere estoque e preço de todos os anúncios.
  await enqueue(id, "stock.push_all");
  await enqueue(id, "price.push_all");
  revalidatePath(PAGE);
  return { ok: true, message: "Loja atualizada." };
}

export async function disconnectShop(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const supabase = await createClient();
  // Confere pela sessão (RLS) que a loja é desta gráfica antes de usar a chave secreta.
  const { data: shop } = await supabase
    .from("marketplace_shops")
    .select("id")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!shop) return { ok: false, error: "Loja não encontrada." };
  const { error } = await admin().rpc("marketplace_forget_tokens", { p_shop: id });
  if (error) return { ok: false, error: "Não foi possível desconectar." };
  revalidatePath(PAGE);
  return { ok: true, message: "Loja desconectada. A autorização foi apagada." };
}

export async function retryFailedJobs(shopId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("marketplace_shops")
    .select("id")
    .eq("id", shopId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!shop) return { ok: false, error: "Loja não encontrada." };
  const { error, count } = await admin()
    .from("marketplace_jobs")
    .update(
      { status: "pendente", attempts: 0, run_after: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("shop_id", shopId)
    .eq("status", "erro");
  if (error) return { ok: false, error: "Não foi possível reenfileirar." };
  revalidatePath(PAGE);
  return { ok: true, message: `${count ?? 0} tarefa(s) voltaram para a fila.` };
}

/** Põe uma tarefa na fila e já começa a processar (sem esperar o relógio). */
async function enqueue(shopId: string, kind: string) {
  await admin().rpc("marketplace_enqueue", { p_shop: shopId, p_kind: kind, p_dedupe: kind });
  after(() => processJobs(10).catch(() => undefined));
}

/** Confere pela sessão (RLS) que a loja é da gráfica ativa. */
async function ownShop(shopId: string, orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_shops")
    .select("id")
    .eq("id", shopId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

export async function importListings(shopId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  if (!(await ownShop(shopId, membership.organizationId)))
    return { ok: false, error: "Loja não encontrada." };
  await enqueue(shopId, "listings.import");
  return { ok: true, message: "Importação iniciada. Atualize a página em alguns instantes." };
}

export async function pushStockNow(shopId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  if (!(await ownShop(shopId, membership.organizationId)))
    return { ok: false, error: "Loja não encontrada." };
  await enqueue(shopId, "stock.push_all");
  await enqueue(shopId, "price.push_all");
  return { ok: true, message: "Envio de estoque e preços iniciado." };
}

/** Vincula (ou desvincula) um anúncio a uma variação do cadastro. */
export async function linkListing(
  listingId: string,
  variantId: string | null,
): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .update({ variant_id: variantId })
    .eq("id", listingId)
    .eq("organization_id", membership.organizationId)
    .select("shop_id")
    .maybeSingle();
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível vincular." }) };
  if (!data) return { ok: false, error: "Anúncio não encontrado." };
  // O gatilho do banco já pôs o envio na fila; aqui só adianta o processamento.
  after(() => processJobs(10).catch(() => undefined));
  revalidatePath(`${PAGE}/${data.shop_id}/anuncios`);
  return { ok: true, message: variantId ? "Anúncio vinculado." : "Vínculo removido." };
}

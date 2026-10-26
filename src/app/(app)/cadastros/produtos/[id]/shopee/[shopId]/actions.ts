"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { ilikeTerm } from "@/lib/list-params";
import { type PublicationPayload, publicationProblems } from "@/lib/marketplaces/publication";
import { getShopeeConfig } from "@/lib/marketplaces/shopee/config";
import { type Attribute, getAttributes } from "@/lib/marketplaces/shopee/publish";
import { admin, loadShop, logger, shopCredentials } from "@/lib/marketplaces/store";
import { processJobs } from "@/lib/marketplaces/worker";
import { createClient } from "@/lib/supabase/server";
import { publicationSchema } from "./schema";

/** Loja conectada e da gráfica ativa (conferido pela sessão, antes da chave secreta). */
async function ownShop(shopId: string, orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_shops")
    .select("id")
    .eq("id", shopId)
    .eq("organization_id", orgId)
    .eq("status", "conectada")
    .maybeSingle();
  return Boolean(data);
}

/** Categorias finais (sem subcategorias) que combinam com a busca. */
export async function searchCategories(q: string) {
  await requireOrg("cadastros.gerenciar");
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketplace_categories")
    .select("category_id, path")
    .eq("marketplace", "shopee")
    .eq("has_children", false)
    .ilike("path", ilikeTerm(term))
    .order("path")
    .limit(30);
  return (data ?? []).map((c) => ({ value: String(c.category_id), label: c.path }));
}

/** Atributos que a Shopee pede para a categoria (consulta na hora). */
export async function loadAttributes(
  shopId: string,
  categoryId: number,
): Promise<{ ok: true; attributes: Attribute[] } | { ok: false; error: string }> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const config = getShopeeConfig();
  if (!config) return { ok: false, error: "A integração com a Shopee não está ativa." };
  if (!(await ownShop(shopId, membership.organizationId)))
    return { ok: false, error: "Loja não encontrada." };
  const shop = await loadShop(shopId);
  if (!shop) return { ok: false, error: "Loja não encontrada." };
  try {
    const creds = await shopCredentials(shop);
    return {
      ok: true,
      attributes: await getAttributes(config, creds, categoryId, { onLog: logger(shop) }),
    };
  } catch (e) {
    return {
      ok: false,
      error: `Não foi possível carregar os atributos: ${e instanceof Error ? e.message : "erro"}`,
    };
  }
}

/** Salva o rascunho e, com `publish`, confere e põe a publicação na fila. */
export async function savePublication(
  productId: string,
  shopId: string,
  input: unknown,
  publish: boolean,
): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const org = membership.organizationId;
  const parsed = publicationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!(await ownShop(shopId, org))) return { ok: false, error: "Loja não encontrada." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("marketplace_publications")
    .select("id, status")
    .eq("shop_id", shopId)
    .eq("product_id", productId)
    .eq("organization_id", org)
    .maybeSingle();
  if (current?.status === "publicado")
    return { ok: false, error: "Este produto já foi publicado nesta loja." };
  if (current?.status === "na_fila")
    return { ok: false, error: "A publicação já está em andamento." };

  const fields = parsed.data;
  let id = current?.id;
  if (id) {
    const { error } = await supabase.from("marketplace_publications").update(fields).eq("id", id);
    if (error)
      return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  } else {
    const { data, error } = await supabase
      .from("marketplace_publications")
      .insert({ ...fields, organization_id: org, shop_id: shopId, product_id: productId })
      .select("id")
      .single();
    if (error)
      return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
    id = data.id;
  }

  const page = `/cadastros/produtos/${productId}`;
  if (!publish) {
    revalidatePath(`${page}/shopee/${shopId}`);
    return { ok: true, message: "Rascunho salvo." };
  }

  // Confere de novo no servidor, com os dados atuais do cadastro.
  const db = admin();
  const { data: payload } = await db.rpc("marketplace_publication_payload", { p_publication: id });
  const p = payload as unknown as PublicationPayload | null;
  if (!p) return { ok: false, error: "Publicação não encontrada." };
  const problems = publicationProblems({
    title: p.publication.title,
    description: p.publication.description,
    category_id: p.publication.category_id,
    logistics: p.publication.logistics,
    images: p.images.length,
    productActive: p.product.active,
    variants: p.variants,
  });
  if (problems.length) return { ok: false, error: problems[0] };

  await db.from("marketplace_publications").update({ status: "na_fila", error: null }).eq("id", id);
  await db.rpc("marketplace_enqueue", {
    p_shop: shopId,
    p_kind: "listing.publish",
    p_payload: { publication_id: id },
    p_dedupe: `publish:${id}`,
  });
  after(() => processJobs(5).catch(() => undefined));
  revalidatePath(page);
  revalidatePath(`${page}/shopee/${shopId}`);
  return { ok: true, message: "Publicação enviada. Em instantes o anúncio aparece na Shopee." };
}

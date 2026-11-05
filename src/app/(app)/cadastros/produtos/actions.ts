"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { dbErrorMessage, saveOrgRecord, type ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import {
  ATTRIBUTE_KEYS,
  bomSchema,
  firstVariantSchema,
  productSchema,
  variantPricesSchema,
  variantSchema,
} from "./schema";

const productPath = (id: string) => `/cadastros/produtos/${id}`;

/**
 * Estoque inicial de uma variação nova: uma entrada no histórico, no máximo uma por variação
 * (índice único no banco; reenviar o formulário não duplica). Exige permissão de estoque.
 */
async function recordInitialStock(variantId: string, quantity: number | null) {
  if (!quantity) return "";
  const { session, membership } = await requireOrg("cadastros.gerenciar");
  if (!can(membership.permissions, "estoque.gerenciar")) {
    return " O estoque inicial não foi lançado: falta a permissão de estoque.";
  }
  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({
    organization_id: membership.organizationId,
    variant_id: variantId,
    type: "entrada",
    quantity,
    reason: "Estoque inicial",
    reference: "estoque-inicial",
    created_by: session.id,
  });
  if (error && error.code !== "23505") return " Não foi possível lançar o estoque inicial.";
  revalidatePath("/estoque", "layout");
  return ` Estoque inicial: ${quantity.toLocaleString("pt-BR")}.`;
}

export async function saveProduct(
  id: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const validId = id ? z.uuid().safeParse(id) : null;
  if (validId && !validId.success) return { ok: false, error: "Produto inválido." };
  const first = validId ? null : firstVariantSchema.safeParse(raw);
  if (first && !first.success) return { ok: false, error: first.error.issues[0].message };

  const result = await saveOrgRecord({
    table: "products",
    permission: "cadastros.gerenciar",
    id: validId?.data,
    values: parsed.data,
    revalidate: ["/cadastros/produtos", ...(validId ? [productPath(validId.data)] : [])],
    messages: {
      created: "Produto criado. Agora cadastre as variações.",
      updated: "Produto atualizado.",
      fallback: "Não foi possível salvar o produto.",
    },
  });
  // Produto novo com a primeira variação: preço, estoque mínimo e inicial já no cadastro.
  const firstVariant = first?.success ? first.data : null;
  if (result.ok && !validId && firstVariant?.first_sku) {
    const variant = await saveVariant(result.data.id, null, {
      name: "Padrão",
      sku: firstVariant.first_sku,
      base_price: String(firstVariant.first_price ?? 0),
      min_stock: String(firstVariant.first_min_stock ?? 0),
      initial_stock: String(firstVariant.first_initial_stock ?? ""),
      active: true,
    });
    if (!variant.ok) {
      return { ok: false, error: `Produto criado, mas a variação não: ${variant.error}` };
    }
  }
  // Produto novo: vai direto para a tela dele, onde ficam variações, ficha e fotos.
  if (result.ok && !validId) redirect(productPath(result.data.id));
  return result;
}

export async function saveVariant(
  productId: string,
  variantId: string | null,
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = variantSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const product = z.uuid().safeParse(productId);
  const variant = variantId ? z.uuid().safeParse(variantId) : null;
  if (!product.success || (variant && !variant.success)) {
    return { ok: false, error: "Variação inválida." };
  }

  const { tamanho, espessura, cor, acabamento, initial_stock, min_stock, ...rest } = parsed.data;
  const attrs = { tamanho, espessura, cor, acabamento };
  const attributes = Object.fromEntries(
    ATTRIBUTE_KEYS.filter((k) => attrs[k]).map((k) => [k, attrs[k]]),
  );

  const result = await saveOrgRecord({
    table: "product_variants",
    permission: "cadastros.gerenciar",
    id: variant?.data,
    values: { ...rest, min_stock: min_stock ?? 0, attributes, product_id: product.data },
    revalidate: [productPath(product.data), "/cadastros/produtos"],
    messages: {
      created: `Variação ${rest.sku} criada.`,
      updated: "Variação atualizada.",
      unique: `Já existe uma variação com o SKU ${rest.sku}.`,
      fallback: "Não foi possível salvar a variação.",
    },
  });
  if (!result.ok || variant) return result;
  const note = await recordInitialStock(result.data.id, initial_stock);
  return { ...result, message: result.message + note };
}

/** Confere que a variação é da gráfica ativa e devolve o produto dela. */
async function ownedVariant(variantId: string) {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const id = z.uuid().safeParse(variantId);
  if (!id.success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("id", id.data)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  return data ? { supabase, membership, variant: data } : null;
}

export async function saveVariantPrices(
  variantId: string,
  raw: Record<string, unknown>,
): Promise<ActionResult> {
  const owned = await ownedVariant(variantId);
  if (!owned) return { ok: false, error: "Variação não encontrada." };
  const parsed = variantPricesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, membership, variant } = owned;

  const entries = Object.entries(parsed.data) as [string, number | null][];
  const manual = entries.filter(([, price]) => price !== null);
  const cleared = entries.filter(([, price]) => price === null).map(([channel]) => channel);

  if (cleared.length) {
    const { error } = await supabase
      .from("variant_channel_prices")
      .delete()
      .eq("variant_id", variant.id)
      .in("channel", cleared as never);
    if (error)
      return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  }
  if (manual.length) {
    const { error } = await supabase.from("variant_channel_prices").upsert(
      manual.map(([channel, price]) => ({
        organization_id: membership.organizationId,
        variant_id: variant.id,
        channel: channel as never,
        price: price as number,
      })),
      { onConflict: "variant_id,channel" },
    );
    if (error)
      return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };
  }

  revalidatePath(productPath(variant.product_id));
  return { ok: true, message: "Preços por canal salvos." };
}

/** Substitui a ficha técnica inteira da variação. */
export async function saveBom(variantId: string, raw: unknown): Promise<ActionResult> {
  const owned = await ownedVariant(variantId);
  if (!owned) return { ok: false, error: "Variação não encontrada." };
  const parsed = bomSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, membership, variant } = owned;

  const { error: deleteError } = await supabase
    .from("bom_items")
    .delete()
    .eq("variant_id", variant.id);
  if (deleteError) {
    return {
      ok: false,
      error: dbErrorMessage(deleteError, { fallback: "Não foi possível salvar a ficha." }),
    };
  }
  if (parsed.data.length) {
    const { error } = await supabase.from("bom_items").insert(
      parsed.data.map((item) => ({
        organization_id: membership.organizationId,
        variant_id: variant.id,
        ...item,
      })),
    );
    if (error) {
      return {
        ok: false,
        error: dbErrorMessage(error, { fallback: "Não foi possível salvar a ficha." }),
      };
    }
  }

  revalidatePath(productPath(variant.product_id));
  revalidatePath("/estoque", "layout");
  return { ok: true, message: "Ficha técnica salva." };
}

/** Copia a ficha técnica de uma variação para outras do mesmo produto. */
export async function copyBom(
  fromVariantId: string,
  toVariantIds: string[],
): Promise<ActionResult> {
  const owned = await ownedVariant(fromVariantId);
  if (!owned) return { ok: false, error: "Variação não encontrada." };
  const targets = z
    .array(z.uuid())
    .min(1, "Escolha ao menos uma variação.")
    .safeParse(toVariantIds);
  if (!targets.success) return { ok: false, error: targets.error.issues[0].message };
  const { supabase, membership, variant } = owned;

  const [{ data: items }, { data: siblings }] = await Promise.all([
    supabase
      .from("bom_items")
      .select("material_id, quantity, waste_pct")
      .eq("variant_id", variant.id),
    supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", variant.product_id)
      .in("id", targets.data),
  ]);
  const ids = (siblings ?? []).map((s) => s.id).filter((id) => id !== variant.id);
  if (!items?.length) return { ok: false, error: "A ficha de origem está vazia." };
  if (!ids.length) return { ok: false, error: "Nenhuma variação de destino válida." };

  const { error: deleteError } = await supabase.from("bom_items").delete().in("variant_id", ids);
  if (deleteError)
    return {
      ok: false,
      error: dbErrorMessage(deleteError, { fallback: "Não foi possível copiar." }),
    };
  const { error } = await supabase.from("bom_items").insert(
    ids.flatMap((id) =>
      items.map((item) => ({
        organization_id: membership.organizationId,
        variant_id: id,
        ...item,
      })),
    ),
  );
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível copiar." }) };

  revalidatePath(productPath(variant.product_id));
  return { ok: true, message: `Ficha copiada para ${ids.length} variação(ões).` };
}

export async function registerProductImage(productId: string, path: string): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const product = z.uuid().safeParse(productId);
  // O caminho precisa estar na pasta da gráfica e do produto (o Storage também confere).
  const prefix = `${membership.organizationId}/${productId}/`;
  if (!product.success || !path.startsWith(prefix) || path.includes("..")) {
    return { ok: false, error: "Arquivo inválido." };
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.data);
  const { error } = await supabase.from("product_images").insert({
    organization_id: membership.organizationId,
    product_id: product.data,
    storage_path: path,
    position: count ?? 0,
  });
  if (error)
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível salvar a foto." }),
    };
  revalidatePath(productPath(product.data));
  return { ok: true, message: "Foto adicionada." };
}

export async function deleteProductImage(imageId: string): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const id = z.uuid().safeParse(imageId);
  if (!id.success) return { ok: false, error: "Foto inválida." };
  const supabase = await createClient();
  const { data: image } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path")
    .eq("id", id.data)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!image) return { ok: false, error: "Foto não encontrada." };

  await supabase.storage.from("produtos").remove([image.storage_path]);
  const { error } = await supabase.from("product_images").delete().eq("id", image.id);
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível remover." }) };
  revalidatePath(productPath(image.product_id));
  return { ok: true, message: "Foto removida." };
}

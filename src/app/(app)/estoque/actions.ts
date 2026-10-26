"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import { consumeSchema, movementSchema } from "./schema";

function revalidateStock() {
  revalidatePath("/estoque", "layout");
  revalidatePath("/cadastros/insumos");
  revalidatePath("/cadastros/produtos", "layout");
}

export async function registerMovement(raw: Record<string, unknown>): Promise<ActionResult> {
  const { session, membership } = await requireOrg("estoque.gerenciar");
  const parsed = movementSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { item, type, quantity, unit_cost, reason } = parsed.data;
  const [kind, id] = item.split(":");

  const supabase = await createClient();
  const { error } = await supabase.from("stock_movements").insert({
    organization_id: membership.organizationId,
    material_id: kind === "material" ? id : null,
    variant_id: kind === "variant" ? id : null,
    type,
    quantity,
    unit_cost,
    reason,
    created_by: session.id,
  });
  if (error) {
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível lançar a movimentação." }),
    };
  }

  revalidateStock();
  return { ok: true, message: "Movimentação lançada." };
}

/** Baixa pela ficha técnica: consome os insumos de N unidades (venda de balcão, produção). */
export async function consumeByBom(raw: Record<string, unknown>): Promise<ActionResult> {
  await requireOrg(["estoque.gerenciar", "pedidos.gerenciar"]);
  const parsed = consumeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_bom", {
    p_variant: parsed.data.variant_id,
    p_quantity: parsed.data.quantity,
    p_reference: parsed.data.reference,
  });
  if (error) {
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível dar baixa." }) };
  }
  if (!data) {
    return { ok: false, error: "Esta variação não tem ficha técnica: nada foi baixado." };
  }

  revalidateStock();
  return { ok: true, message: `Baixa feita em ${data} insumo(s).` };
}

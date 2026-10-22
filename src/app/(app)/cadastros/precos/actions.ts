"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { SALES_CHANNELS } from "@/lib/catalog/pricing";
import { parseDecimal } from "@/lib/form-schemas";
import { createClient } from "@/lib/supabase/server";

const rulesSchema = z.record(
  z.enum(SALES_CHANNELS),
  z.preprocess(
    (v) => parseDecimal(v) ?? 0,
    z.number({ error: "Informe um número." }).min(-90, "Mínimo -90%.").max(500, "Máximo 500%."),
  ),
);

export async function saveChannelRules(raw: Record<string, unknown>): Promise<ActionResult> {
  const { membership } = await requireOrg("cadastros.gerenciar");
  const parsed = rulesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const rows = SALES_CHANNELS.map((channel) => ({
    organization_id: membership.organizationId,
    channel,
    adjustment_pct: parsed.data[channel] ?? 0,
  }));
  const { error } = await supabase
    .from("channel_price_rules")
    .upsert(rows, { onConflict: "organization_id,channel" });
  if (error)
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível salvar." }) };

  revalidatePath("/cadastros/precos");
  revalidatePath("/cadastros/produtos", "layout");
  return { ok: true, message: "Ajustes de preço por canal salvos." };
}

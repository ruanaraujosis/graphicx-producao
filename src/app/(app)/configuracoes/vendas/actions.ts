"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import type { ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";

const percent = z.number().min(0, "Use de 0 a 100%.").max(100, "Use de 0 a 100%.");

const settingsSchema = z
  .object({
    seller_max_discount: percent,
    manager_max_discount: percent,
    require_payment_method: z.boolean(),
    warn_overdue_receivables: z.boolean(),
    tag_first_purchase: z.boolean(),
    warn_incomplete_address: z.boolean(),
    default_note: z.string().trim().max(1000),
    print_code: z.enum(["qr", "barras"]),
    print_product_images: z.boolean(),
    print_item_order: z.enum(["inclusao", "sku", "descricao"]),
  })
  .refine((v) => v.manager_max_discount >= v.seller_max_discount, {
    path: ["manager_max_discount"],
    message: "O limite do gerente não pode ser menor que o do vendedor.",
  });

export async function saveSalesSettings(input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg("configuracoes.gerenciar");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira os dados." };

  const supabase = await createClient();
  const { error } = await supabase.from("sales_settings").upsert({
    organization_id: membership.organizationId,
    ...parsed.data,
    default_note: parsed.data.default_note || null,
  });
  if (error) return { ok: false, error: "Não foi possível salvar as configurações de venda." };

  revalidatePath("/configuracoes/vendas");
  revalidatePath("/vendas/nova");
  return { ok: true, message: "Configurações de venda salvas." };
}

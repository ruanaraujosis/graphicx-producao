"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { parseLoginIdentifier, usernameToEmail } from "@/lib/auth/username";
import { dbErrorMessage, type ActionResult } from "@/lib/crud";
import { digits } from "@/lib/documents";
import { createAdminClient, createStatelessClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const saleSchema = z.object({
  channel: z.enum(["balcao", "whatsapp"]),
  customer_id: z.uuid().nullable(),
  customer_name: z.string().trim().max(160),
  customer_phone: z.string().trim().max(20),
  seller_id: z.uuid().nullable(),
  payment_method_id: z.uuid().nullable(),
  discount: z.number().min(0).max(10_000_000),
  notes: z.string().trim().max(2000),
  paid: z.boolean(),
  authorization_id: z.uuid().nullable(),
  items: z
    .array(
      z.object({
        variant_id: z.uuid(),
        description: z.string().trim().min(1).max(300),
        quantity: z.number().positive().max(1_000_000),
        /** Só vai quando a pessoa trocou o preço (produto com ficha técnica). */
        unit_price: z.number().min(0).max(10_000_000).nullable(),
      }),
    )
    .min(1, "Inclua pelo menos um produto.")
    .max(100, "Máximo de 100 itens."),
});

/**
 * Pedido de venda: o banco recalcula preço e totais, confere o desconto (vendedor
 * até o limite; acima, a liberação do gerente) e baixa o estoque.
 */
export async function createSale(
  input: unknown,
): Promise<ActionResult<{ id: string; number: number }>> {
  const { membership } = await requireOrg(["pedidos.gerenciar", "vendas.gerenciar"]);
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira a venda." };
  const v = parsed.data;
  const phone = digits(v.customer_phone);

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_sale", {
    p_org: membership.organizationId,
    p_fields: {
      channel: v.channel,
      customer_id: v.customer_id ?? "",
      customer_name: v.customer_name.length >= 2 ? v.customer_name : "Consumidor final",
      customer_phone: phone.length >= 10 ? phone : "",
      seller_id: v.seller_id ?? "",
      payment_method_id: v.payment_method_id ?? "",
      discount: v.discount,
      notes: v.notes,
    },
    p_items: v.items.map((i) => ({
      variant_id: i.variant_id,
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price ?? "",
    })),
    p_paid: v.paid,
    p_authorization: v.authorization_id ?? undefined,
  });
  if (error || !id)
    return {
      ok: false,
      error: error
        ? dbErrorMessage(error, { fallback: "Não foi possível lançar a venda." })
        : "Não foi possível lançar a venda.",
    };

  const { data: order } = await supabase.from("orders").select("number").eq("id", id).single();
  revalidatePath("/pedidos");
  revalidatePath("/financeiro");
  revalidatePath("/estoque");
  revalidatePath("/inicio");
  return {
    ok: true,
    message: `Venda #${order?.number ?? ""} lançada.`,
    data: { id, number: order?.number ?? 0 },
  };
}

const authorizeSchema = z.object({
  identifier: z.string().trim().min(1, "Informe o usuário do gerente.").max(254),
  password: z.string().min(1, "Informe a senha do gerente.").max(72),
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .pipe(z.string().max(6)),
  percent: z.number().positive().max(100),
});

export type AuthorizeResult =
  | { ok: true; authorizationId: string; managerName: string }
  | { ok: false; error: string; needsCode?: boolean };

const WRONG = "Usuário ou senha do gerente incorretos.";

/**
 * Liberação de desconto no aparelho do vendedor. A senha (e o código do
 * autenticador, se houver) do gerente é conferida num cliente separado, sem
 * trocar a sessão de quem está vendendo; a liberação é gravada com o acesso do
 * próprio gerente, e o RLS confere vendas.autorizar e o limite da gráfica.
 * Nenhuma senha é guardada nem registrada.
 */
export async function authorizeDiscount(input: unknown): Promise<AuthorizeResult> {
  const { membership } = await requireOrg("vendas.gerenciar");
  const parsed = authorizeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? WRONG };
  const v = parsed.data;

  const admin = createAdminClient();
  // Limita as tentativas de senha por gráfica (evita adivinhar a senha do gerente no balcão).
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_key: `desconto:${membership.organizationId}`,
    p_limit: 10,
    p_window_seconds: 900,
  });
  if (allowed === false)
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };

  const identifier = parseLoginIdentifier(v.identifier);
  let email = identifier.value;
  if (identifier.kind !== "email") {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("username", identifier.value)
      .maybeSingle();
    email = profile?.email ?? usernameToEmail(identifier.value);
  }

  const manager = createStatelessClient();
  const { data: signIn, error: signInError } = await manager.auth.signInWithPassword({
    email,
    password: v.password,
  });
  if (signInError || !signIn.user) return { ok: false, error: WRONG };

  try {
    // Gerente com app autenticador: a sessão precisa do código (aal2).
    const { data: factors } = await manager.auth.mfa.listFactors();
    const totp = factors?.totp[0];
    if (totp) {
      if (v.code.length !== 6) {
        return {
          ok: false,
          needsCode: true,
          error: "Digite o código de 6 dígitos do app autenticador do gerente.",
        };
      }
      const { error: mfaError } = await manager.auth.mfa.challengeAndVerify({
        factorId: totp.id,
        code: v.code,
      });
      if (mfaError) return { ok: false, needsCode: true, error: "Código do gerente inválido." };
    }

    const { data, error } = await manager
      .from("discount_authorizations")
      .insert({ organization_id: membership.organizationId, max_percent: v.percent })
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error:
          "Este usuário não pode liberar esse desconto (precisa da permissão de liberar desconto e o limite da gráfica precisa permitir).",
      };
    }

    const { data: profile } = await manager
      .from("profiles")
      .select("full_name")
      .eq("id", signIn.user.id)
      .maybeSingle();
    return {
      ok: true,
      authorizationId: data.id,
      managerName: profile?.full_name ?? "Gerente",
    };
  } finally {
    // Encerra só esta sessão do gerente (os aparelhos dele continuam logados).
    await manager.auth.signOut({ scope: "local" });
  }
}

export type OverdueInfo = { count: number; total: number; oldest: string | null };

/** Contas em atraso do cliente, para o aviso no pedido de venda. */
export async function customerOverdue(customerId: string): Promise<OverdueInfo | null> {
  await requireOrg(["pedidos.gerenciar", "vendas.gerenciar"]);
  if (!z.uuid().safeParse(customerId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_overdue", { p_customer: customerId });
  const row = data?.[0];
  if (error || !row) return null;
  return { count: row.overdue_count, total: row.overdue_total, oldest: row.oldest_due };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import { dbErrorMessage, saveOrgRecord, type ActionResult } from "@/lib/crud";
import { createClient } from "@/lib/supabase/server";
import {
  categorySchema,
  goalSchema,
  payableSchema,
  receivableSchema,
  settleSchema,
} from "./schema";

function revalidateFinance() {
  revalidatePath("/financeiro", "layout");
}

const fail = (
  error: { code?: string; message: string } | null,
  fallback: string,
): ActionResult => ({
  ok: false,
  error: error ? dbErrorMessage(error, { fallback }) : fallback,
});

// -----------------------------------------------------------------------------
// Contas a receber
// -----------------------------------------------------------------------------
export async function saveReceivable(input: unknown, id?: string): Promise<ActionResult> {
  const { membership } = await requireOrg("financeiro.gerenciar");
  const parsed = receivableSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  if (!id) {
    const result = await saveOrgRecord({
      table: "receivables",
      permission: "financeiro.gerenciar",
      values: v,
      revalidate: "/financeiro",
      messages: {
        created: "Conta a receber lançada.",
        updated: "",
        fallback: "Não foi possível lançar.",
      },
    });
    revalidateFinance();
    return result.ok ? { ok: true, message: result.message } : result;
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("receivables")
    .select("order_id, gross")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Conta não encontrada." };
  // Conta de pedido: o valor acompanha o pedido; só taxa, vencimento e observação mudam.
  const values = current.order_id ? { fee: v.fee, due_date: v.due_date, notes: v.notes } : v;
  if (current.order_id && v.fee > current.gross) {
    return { ok: false, error: "A taxa não pode passar do valor do pedido." };
  }
  const { error } = await supabase.from("receivables").update(values).eq("id", id);
  if (error) return fail(error, "Não foi possível salvar.");
  revalidateFinance();
  return { ok: true, message: "Conta atualizada." };
}

export async function settleReceivable(id: string, input: unknown): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("receivables")
    .update({ status: "recebido", received_at: parsed.data.date })
    .eq("id", id)
    .eq("status", "aberto");
  if (error) return fail(error, "Não foi possível dar baixa.");
  revalidateFinance();
  return { ok: true, message: "Recebimento registrado." };
}

export async function reopenReceivable(id: string): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("receivables")
    .update({ status: "aberto", received_at: null })
    .eq("id", id)
    .neq("status", "aberto");
  if (error) return fail(error, "Não foi possível reabrir.");
  revalidateFinance();
  return { ok: true, message: "Conta reaberta." };
}

export async function cancelReceivable(id: string): Promise<ActionResult> {
  const { membership } = await requireOrg("financeiro.gerenciar");
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("receivables")
    .select("order_id")
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!current) return { ok: false, error: "Conta não encontrada." };
  if (current.order_id) {
    return { ok: false, error: "Esta conta é de um pedido: cancele o pedido para cancelá-la." };
  }
  const { error } = await supabase
    .from("receivables")
    .update({ status: "cancelado", received_at: null })
    .eq("id", id);
  if (error) return fail(error, "Não foi possível cancelar.");
  revalidateFinance();
  return { ok: true, message: "Conta cancelada." };
}

// -----------------------------------------------------------------------------
// Contas a pagar
// -----------------------------------------------------------------------------
export async function savePayable(input: unknown, id?: string): Promise<ActionResult> {
  const parsed = payableSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const result = await saveOrgRecord({
    table: "payables",
    permission: "financeiro.gerenciar",
    id,
    values: parsed.data,
    revalidate: "/financeiro",
    messages: {
      created: "Conta a pagar lançada.",
      updated: "Conta atualizada.",
      fallback: "Não foi possível salvar a conta.",
    },
  });
  revalidateFinance();
  return result.ok ? { ok: true, message: result.message } : result;
}

export async function settlePayable(id: string, input: unknown): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payables")
    .update({ status: "pago", paid_at: parsed.data.date })
    .eq("id", id)
    .eq("status", "aberto")
    .select("recurrence")
    .maybeSingle();
  if (error) return fail(error, "Não foi possível dar baixa.");
  revalidateFinance();
  return {
    ok: true,
    message:
      data?.recurrence === "mensal"
        ? "Pagamento registrado. A conta do próximo mês já foi lançada."
        : "Pagamento registrado.",
  };
}

export async function reopenPayable(id: string): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("payables")
    .update({ status: "aberto", paid_at: null })
    .eq("id", id)
    .neq("status", "aberto");
  if (error) return fail(error, "Não foi possível reabrir.");
  revalidateFinance();
  return { ok: true, message: "Conta reaberta." };
}

export async function cancelPayable(id: string): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("payables")
    .update({ status: "cancelado", paid_at: null })
    .eq("id", id);
  if (error) return fail(error, "Não foi possível cancelar.");
  revalidateFinance();
  return { ok: true, message: "Conta cancelada." };
}

// -----------------------------------------------------------------------------
// Categorias e meta
// -----------------------------------------------------------------------------
export async function saveCategory(input: unknown, id?: string): Promise<ActionResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nome inválido." };
  const result = await saveOrgRecord({
    table: "expense_categories",
    permission: "financeiro.gerenciar",
    id,
    values: parsed.data,
    revalidate: "/financeiro",
    messages: {
      created: "Categoria criada.",
      updated: "Categoria renomeada.",
      unique: "Já existe uma categoria com esse nome.",
      fallback: "Não foi possível salvar a categoria.",
    },
  });
  revalidateFinance();
  return result.ok ? { ok: true, message: result.message } : result;
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  await requireOrg("financeiro.gerenciar");
  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").update({ active }).eq("id", id);
  if (error) return fail(error, "Não foi possível alterar a categoria.");
  revalidateFinance();
  return { ok: true, message: active ? "Categoria reativada." : "Categoria desativada." };
}

export async function saveGoal(input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg(["financeiro.gerenciar", "configuracoes.gerenciar"]);
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Meta inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_settings")
    .upsert(
      { organization_id: membership.organizationId, monthly_goal: parsed.data.monthly_goal },
      { onConflict: "organization_id" },
    );
  if (error) return fail(error, "Não foi possível salvar a meta.");
  revalidateFinance();
  revalidatePath("/configuracoes/tv");
  return { ok: true, message: "Meta do mês salva." };
}

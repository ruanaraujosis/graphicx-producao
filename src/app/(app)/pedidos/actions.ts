"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/dal";
import { customerSchema } from "@/app/(app)/cadastros/clientes/schema";
import { dbErrorMessage, saveOrgRecord, type ActionResult } from "@/lib/crud";
import { digits } from "@/lib/documents";
import { ilikeTerm } from "@/lib/list-params";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/status";
import { createClient } from "@/lib/supabase/server";
import { commentSchema, orderSchema } from "./schema";

function revalidateOrders(id?: string) {
  revalidatePath("/pedidos");
  revalidatePath("/pcp");
  revalidatePath("/artes");
  if (id) revalidatePath(`/pedidos/${id}`);
}

/** Cria (orçamento ou pedido) ou atualiza um pedido com os itens, numa transação. */
export async function saveOrder(
  input: unknown,
  id?: string,
): Promise<ActionResult<{ id: string }>> {
  const { membership } = await requireOrg("pedidos.gerenciar");
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Confira os dados do pedido." };
  }
  const v = parsed.data;
  const fields = {
    channel: v.channel,
    customer_id: v.customer_id,
    customer_name: v.customer_name,
    customer_phone: v.customer_phone,
    needs_art: v.needs_art,
    due_date: v.due_date,
    payment_method_id: v.payment_method_id,
    discount: v.discount,
    shipping: v.shipping,
    notes: v.notes,
  };
  const items = v.items.map((i) => ({
    id: i.id,
    variant_id: i.variant_id,
    description: i.description,
    quantity: i.quantity,
    unit_price: i.unit_price,
  }));

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.rpc("update_order", {
      p_order: id,
      p_fields: fields,
      p_items: items,
    });
    if (error) {
      return {
        ok: false,
        error: dbErrorMessage(error, { fallback: "Não foi possível salvar o pedido." }),
      };
    }
    revalidateOrders(id);
    return { ok: true, message: "Pedido atualizado.", data: { id } };
  }

  const status: OrderStatus = v.as_quote ? "orcamento" : v.needs_art ? "aguardando_arte" : "novo";
  const { data, error } = await supabase.rpc("create_order", {
    p_org: membership.organizationId,
    p_status: status,
    p_fields: fields,
    p_items: items,
  });
  if (error || !data) {
    return {
      ok: false,
      error: error
        ? dbErrorMessage(error, { fallback: "Não foi possível criar o pedido." })
        : "Não foi possível criar o pedido.",
    };
  }
  revalidateOrders();
  return {
    ok: true,
    message: v.as_quote ? "Orçamento criado." : "Pedido criado.",
    data: { id: data },
  };
}

export type CustomerHit = { id: string; name: string; phone: string | null };

/** Busca rápida de clientes para o formulário do pedido. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  const { membership } = await requireOrg("pedidos.gerenciar");
  const term = q.trim();
  if (term.length < 2) return [];
  const supabase = await createClient();
  const phone = digits(term);
  const filters = [`name.ilike.${ilikeTerm(term)}`, `legal_name.ilike.${ilikeTerm(term)}`];
  if (phone.length >= 4) filters.push(`whatsapp.ilike.%${phone}%`, `phone.ilike.%${phone}%`);
  const { data } = await supabase
    .from("customers")
    .select("id, name, whatsapp, phone")
    .eq("organization_id", membership.organizationId)
    .eq("active", true)
    .or(filters.join(","))
    .order("name")
    .limit(8);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.whatsapp ?? c.phone }));
}

/** Muda o status. O banco confere quem pode mover para qual etapa. */
export async function changeOrderStatus(
  orderId: string,
  status: string,
  note?: string,
): Promise<ActionResult> {
  await requireOrg([
    "pedidos.gerenciar",
    "artes.gerenciar",
    "pcp.gerenciar",
    "expedicao.gerenciar",
  ]);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Status inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_order_status", {
    p_order: orderId,
    p_status: status as OrderStatus,
    p_note: note?.trim() || null,
  });
  if (error) {
    return {
      ok: false,
      error: dbErrorMessage(error, { fallback: "Não foi possível mudar o status." }),
    };
  }
  revalidateOrders(orderId);
  return { ok: true, message: "Status atualizado." };
}

export async function addOrderComment(input: unknown): Promise<ActionResult> {
  const { membership } = await requireOrg([
    "pedidos.gerenciar",
    "artes.gerenciar",
    "pcp.gerenciar",
    "expedicao.gerenciar",
  ]);
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Comentário inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("order_events").insert({
    organization_id: membership.organizationId,
    order_id: parsed.data.order_id,
    type: "comentario",
    message: parsed.data.message,
  });
  if (error) {
    return { ok: false, error: dbErrorMessage(error, { fallback: "Não foi possível comentar." }) };
  }
  revalidatePath(`/pedidos/${parsed.data.order_id}`);
  return { ok: true, message: "Comentário registrado." };
}

/** Cadastra o cliente sem sair do pedido (quem cria pedidos pode cadastrar clientes). */
export async function createCustomerFromOrder(
  raw: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return saveOrgRecord({
    table: "customers",
    permission: "pedidos.gerenciar",
    values: parsed.data,
    revalidate: "/cadastros/clientes",
    messages: {
      created: `Cliente ${parsed.data.name} cadastrado e selecionado no pedido.`,
      updated: "Cliente atualizado.",
      unique: "Já existe um cliente com esse CPF/CNPJ. Busque pelo nome.",
      fallback: "Não foi possível cadastrar o cliente.",
    },
  });
}

import { z } from "zod";
import { requireOrg } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * LGPD (art. 18, II e V): todos os dados de um cliente em JSON, para atender pedidos de acesso
 * e portabilidade. Exige a permissão de LGPD; o RLS limita à gráfica ativa.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/cadastros/clientes/[id]/dados">,
) {
  const { membership } = await requireOrg("lgpd.gerenciar");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response("Cliente inválido.", { status: 400 });

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, person_type, name, legal_name, document, email, phone, whatsapp, origin, cep, street, number, complement, district, city, state, notes, active, anonymized_at, created_at, updated_at",
    )
    .eq("id", id.data)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  if (!customer) return new Response("Cliente não encontrado.", { status: 404 });

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, number, channel, status, customer_name, customer_phone, total, created_at, delivered_at, order_items(description, quantity, unit_price), art_reviews(decision, comment, reviewer_name, ip, created_at)",
    )
    .eq("customer_id", id.data)
    .eq("organization_id", membership.organizationId)
    .order("created_at");

  const file = {
    gerado_em: new Date().toISOString(),
    controlador: membership.name,
    aviso:
      "Dados pessoais do titular tratados pela gráfica no GraphicX (LGPD, art. 18). Arquivos de arte não estão incluídos.",
    cliente: customer,
    pedidos: (orders ?? []).map(({ order_items, art_reviews, ...order }) => ({
      ...order,
      itens: order_items,
      aprovacoes_de_arte: art_reviews,
    })),
  };

  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dados-cliente-${id.data.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

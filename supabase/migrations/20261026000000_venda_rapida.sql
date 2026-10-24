-- =============================================================================
-- Venda rápida (balcão): pedido já entregue, estoque baixado na hora e, se o
-- cliente pagou, conta a receber já recebida. Uma transação só.
-- =============================================================================

create or replace function public.quick_sale(
  p_org uuid,
  p_fields jsonb,
  p_items jsonb,
  p_paid boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.has_permission(p_org, 'pedidos.gerenciar')) then
    raise exception 'Sem permissão para lançar vendas.' using errcode = '42501';
  end if;
  if coalesce((p_fields ->> 'channel'), 'balcao') not in ('balcao', 'whatsapp') then
    raise exception 'Venda rápida é para balcão ou WhatsApp.' using errcode = '22023';
  end if;

  -- Mesmo caminho do pedido comum (itens, totais, reserva), sem arte.
  v_id := public.create_order(p_org, 'novo', p_fields || '{"needs_art": false}'::jsonb, p_items);

  -- Entregue na hora: baixa o estoque (pronto ou insumos da ficha) e marca a entrega.
  perform set_config('app.status_note', 'Venda rápida no balcão.', true);
  update public.orders set status = 'entregue' where id = v_id;

  if p_paid then
    update public.receivables
    set status = 'recebido',
        received_at = (now() at time zone 'America/Sao_Paulo')::date
    where order_id = v_id and status = 'aberto';
  end if;
  return v_id;
end;
$$;

revoke all on function public.quick_sale(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.quick_sale(uuid, jsonb, jsonb, boolean) to authenticated;

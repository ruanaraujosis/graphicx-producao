-- LGPD: guarda limitada dos dados de compradores da Shopee. Nome, telefone e identificador do
-- comprador ficam 5 anos contados de 1º de janeiro do ano seguinte à entrega ou ao cancelamento
-- (CTN, arts. 173 e 195; CDC, art. 27). Depois disso, uma rotina diária anonimiza esses dados;
-- pedido e valores continuam para o financeiro.

create or replace function private.anonymize_old_marketplace_buyers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Pedido de 2026 fica até 31/12/2031: sai quando o fim for anterior a 1º/jan de (ano atual − 5).
  v_cutoff timestamptz :=
    (date_trunc('year', now() at time zone 'America/Sao_Paulo') - interval '5 years')
      at time zone 'America/Sao_Paulo';
  v_orders text[];
  c_name constant text := 'Comprador anonimizado';
  c_order_keys constant text[] := array['customer_name', 'customer_phone', 'external_buyer_id'];
begin
  with alvo as (
    select id from public.orders
     where channel = 'shopee'
       and status in ('entregue', 'cancelado')
       and coalesce(delivered_at, status_changed_at) < v_cutoff
       and customer_name <> c_name
     limit 5000
  ), feitos as (
    update public.orders o
       set customer_name = c_name, customer_phone = null, external_buyer_id = null
      from alvo
     where o.id = alvo.id
    returning o.id::text as id
  )
  select coalesce(array_agg(id), '{}') into v_orders from feitos;

  if cardinality(v_orders) > 0 then
    update public.audit_log
       set old_data = old_data - c_order_keys, new_data = new_data - c_order_keys
     where table_name = 'orders' and record_id = any (v_orders);
    update public.audit_log
       set old_data = old_data - 'customer_name', new_data = new_data - 'customer_name'
     where table_name = 'receivables'
       and (coalesce(new_data, old_data) ->> 'order_id') = any (v_orders);
  end if;

  update public.marketplace_reviews
     set buyer_name = null
   where buyer_name is not null and coalesce(commented_at, created_at) < v_cutoff;

  return cardinality(v_orders);
end;
$$;

comment on function private.anonymize_old_marketplace_buyers() is
  'LGPD: anonimiza compradores da Shopee após 5 anos (a partir de 1º/jan do ano seguinte). Rotina diária.';

revoke all on function private.anonymize_old_marketplace_buyers() from public, anon, authenticated;

-- Todo dia às 3h30 (horário de Brasília).
select cron.schedule('lgpd-retencao-shopee', '30 6 * * *',
  $$select private.anonymize_old_marketplace_buyers()$$);

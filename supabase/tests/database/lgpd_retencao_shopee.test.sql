-- LGPD: compradores da Shopee anonimizados depois de 5 anos (a partir de 1º/jan do ano seguinte).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000c1', 'grafica-retencao', 'Gráfica Retenção');

-- Antigo: entregue há 7 anos. Limite: entregue em junho de (ano atual − 5), ainda no prazo.
-- Recente: entregue no ano passado. Balcão antigo: fora da regra (a gráfica decide).
insert into public.orders (id, organization_id, channel, customer_name, customer_phone, external_buyer_id, status, delivered_at) values
  ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c1', 'shopee',
   'Comprador Antigo', '11988887777', 'B1', 'entregue', now() - interval '7 years'),
  ('30000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c1', 'shopee',
   'Comprador Limite', '11988886666', 'B2', 'entregue',
   make_timestamptz(extract(year from now())::int - 5, 6, 15, 12, 0, 0, 'America/Sao_Paulo')),
  ('30000000-0000-0000-0000-0000000000c3', '10000000-0000-0000-0000-0000000000c1', 'shopee',
   'Comprador Recente', '11988885555', 'B3', 'entregue', now() - interval '1 year'),
  ('30000000-0000-0000-0000-0000000000c4', '10000000-0000-0000-0000-0000000000c1', 'balcao',
   'Cliente Balcão', '11988884444', null, 'entregue', now() - interval '7 years');

select is(private.anonymize_old_marketplace_buyers(), 1, 'só o pedido fora do prazo é anonimizado');
select is(
  (select row(customer_name, customer_phone, external_buyer_id, status)::text
     from public.orders where id = '30000000-0000-0000-0000-0000000000c1'),
  row('Comprador anonimizado', null::text, null::text, 'entregue')::text,
  'pedido antigo mantido, sem dados do comprador');
select is(
  (select count(*) from public.orders
    where id in ('30000000-0000-0000-0000-0000000000c2', '30000000-0000-0000-0000-0000000000c3')
      and customer_name like 'Comprador %' and customer_name <> 'Comprador anonimizado'),
  2::bigint, 'pedidos dentro dos 5 anos continuam com os dados');
select is(
  (select customer_name from public.orders where id = '30000000-0000-0000-0000-0000000000c4'),
  'Cliente Balcão', 'balcão não entra na rotina');
select is(
  (select count(*) from public.audit_log
    where (coalesce(old_data::text, '') || coalesce(new_data::text, '')) ~ 'Comprador Antigo|11988887777'),
  0::bigint, 'auditoria sem os dados do comprador antigo');
select is(private.anonymize_old_marketplace_buyers(), 0, 'rodar de novo não refaz nada');

select * from finish();
rollback;

-- Status Vendido (Fase 9.2): só vendas, travadas depois de concluídas, fora do PCP.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009b1', 'vendedor@sv.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000009b1', 'sara.vendas', 'Sara');
insert into public.organizations (id, slug, name)
values ('10000000-0000-0000-0000-0000000009b1', 'grafica-sv', 'Gráfica SV');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000009b1', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000009b1' and r.name = 'Atendimento';

insert into public.products (id, organization_id, name, fulfillment)
values ('30000000-0000-0000-0000-0000000009b1', '10000000-0000-0000-0000-0000000009b1', 'Adesivo', 'pronta_entrega');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price)
values ('40000000-0000-0000-0000-0000000009b1', '10000000-0000-0000-0000-0000000009b1',
        '30000000-0000-0000-0000-0000000009b1', 'ADS-SV', 'Redondo', 5);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000009b1', '40000000-0000-0000-0000-0000000009b1', 'entrada', 50);

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009b1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select public.create_sale('10000000-0000-0000-0000-0000000009b1', '{"customer_name":"Balcão"}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009b1","description":"Adesivo","quantity":4}]',
  true) as venda \gset
select public.create_order('10000000-0000-0000-0000-0000000009b1', 'novo', '{"customer_name":"Cliente","needs_art":false}',
  '[{"id":"","variant_id":"40000000-0000-0000-0000-0000000009b1","description":"Adesivo","quantity":1,"unit_price":5}]') as pedido \gset
reset role;

select results_eq(
  format($$ select status::text, kind::text, sold_at is not null from public.orders where id = %L $$, :'venda'),
  $$ values ('vendido'::text, 'venda'::text, true) $$,
  'pedido de venda termina em Vendido com a data da venda');
select is((select stock_state::text from public.order_items where order_id = :'venda'), 'baixado',
  'estoque da venda baixado');
select is((select on_hand from public.stock_balances where variant_id = '40000000-0000-0000-0000-0000000009b1'),
  46::numeric, 'estoque caiu de 50 para 46');
select is((select status from public.receivables where order_id = :'venda'), 'recebido', 'a receber recebido');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009b1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select throws_ok(
  format($$ select public.change_order_status(%L, 'vendido') $$, :'pedido'),
  '42501', null, 'pedido de produção não vai para Vendido');
select throws_ok(
  format($$ select public.change_order_status(%L, 'cancelado', 'teste') $$, :'venda'),
  '42501', null, 'venda vendida não muda de status pela troca comum');
select throws_ok(
  format($$ select public.update_order(%L, '{"customer_name":"Outro"}',
    '[{"id":"","variant_id":"40000000-0000-0000-0000-0000000009b1","description":"Adesivo","quantity":9,"unit_price":5}]') $$, :'venda'),
  null, null, 'venda vendida não é editada');
select throws_ok(
  format($$ delete from public.order_items where order_id = %L $$, :'venda'),
  null, null, 'itens da venda vendida não saem');
reset role;

select throws_ok(
  format($$ delete from public.orders where id = %L $$, :'venda'),
  '42501', null, 'venda vendida não é apagada');
select throws_ok(
  format($$ update public.orders set status = 'vendido' where id = %L $$, :'pedido'),
  '23514', null, 'banco recusa Vendido fora de venda');
select lives_ok(
  format($$ update public.orders set customer_name = 'Cliente anonimizado', customer_phone = null where id = %L $$, :'venda'),
  'nome do cliente pode ser anonimizado (LGPD)');

select * from finish();
rollback;

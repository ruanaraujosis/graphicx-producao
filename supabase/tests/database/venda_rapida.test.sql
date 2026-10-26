-- Venda rápida: entregue na hora, estoque baixado e conta recebida.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a9', 'balcao@vr.local'),
  ('00000000-0000-0000-0000-0000000000aa', 'prod@vr.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000a9', 'bia.balcao', 'Bia'),
  ('00000000-0000-0000-0000-0000000000aa', 'pedro.prod2', 'Pedro');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000000a9', 'grafica-vr', 'Gráfica VR');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000a9', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000a9' and r.name = 'Atendimento';
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000aa', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000a9' and r.name = 'Produção';

insert into public.products (id, organization_id, name, fulfillment)
values ('30000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9', 'Chaveiro', 'pronta_entrega');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price)
values ('40000000-0000-0000-0000-0000000000a9', '10000000-0000-0000-0000-0000000000a9',
        '30000000-0000-0000-0000-0000000000a9', 'CHV-VR', 'Padrão', 10);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000000a9', '40000000-0000-0000-0000-0000000000a9', 'entrada', 10);

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select public.quick_sale('10000000-0000-0000-0000-0000000000a9',
  '{"channel":"balcao","customer_name":"Consumidor final","discount":2}',
  '[{"id":"","variant_id":"40000000-0000-0000-0000-0000000000a9","description":"Chaveiro","quantity":3,"unit_price":10}]',
  true) as venda_id \gset
reset role;

select is((select status::text from public.orders where id = :'venda_id'), 'entregue', 'venda nasce entregue');
select is((select needs_art from public.orders where id = :'venda_id'), false, 'sem arte');
select is((select total from public.orders where id = :'venda_id'), 28.00::numeric, 'total com desconto');
select is((select stock_state::text from public.order_items where order_id = :'venda_id'), 'baixado',
  'item baixado do estoque');
select is((select on_hand from public.stock_balances where variant_id = '40000000-0000-0000-0000-0000000000a9'),
  7::numeric, 'estoque caiu de 10 para 7');
select results_eq(
  format($$ select status, received_at is not null from public.receivables where order_id = %L $$, :'venda_id'),
  $$ values ('recebido'::text, true) $$,
  'pago agora: conta já recebida');

-- Quem não gerencia pedidos não lança venda.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select throws_ok(
  $$ select public.quick_sale('10000000-0000-0000-0000-0000000000a9', '{"customer_name":"X"}',
       '[{"id":"","variant_id":"","description":"Item","quantity":1,"unit_price":1}]', true) $$,
  '42501', null, 'produção não lança venda');
reset role;

select * from finish();
rollback;

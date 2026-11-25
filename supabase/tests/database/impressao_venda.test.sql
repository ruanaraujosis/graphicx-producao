-- Documento do pedido de venda (Fase 9.3): descrição complementar do item.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000009c1', 'vendedor@iv.local');
insert into public.profiles (id, username, full_name) values ('00000000-0000-0000-0000-0000000009c1', 'ivo.vendas', 'Ivo');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000009c1', 'grafica-iv', 'Gráfica IV');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000009c1', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000009c1' and r.name = 'Atendimento';
insert into public.products (id, organization_id, name, fulfillment)
values ('30000000-0000-0000-0000-0000000009c1', '10000000-0000-0000-0000-0000000009c1', 'Cartão', 'pronta_entrega');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('40000000-0000-0000-0000-0000000009c1', '10000000-0000-0000-0000-0000000009c1', '30000000-0000-0000-0000-0000000009c1', 'CAR-IV', '100 un', 30),
  ('40000000-0000-0000-0000-0000000009c2', '10000000-0000-0000-0000-0000000009c1', '30000000-0000-0000-0000-0000000009c1', 'CAR-IV2', '500 un', 90);

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009c1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select public.create_sale('10000000-0000-0000-0000-0000000009c1', '{"customer_name":"Balcão"}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009c1","description":"Cartão 100","quantity":1,"complement":"  Verniz localizado  "},
    {"variant_id":"40000000-0000-0000-0000-0000000009c2","description":"Cartão 500","quantity":1}]',
  true) as venda \gset
reset role;

select results_eq(
  format($$ select position::int, complement from public.order_items where order_id = %L order by position $$, :'venda'),
  $$ values (1, 'Verniz localizado'::text), (2, null::text) $$,
  'complemento gravado no item certo, sem espaços sobrando');

select throws_ok(
  format($$ update public.order_items set complement = 'Outro' where order_id = %L $$, :'venda'),
  null, null, 'complemento da venda concluída não muda');
select lives_ok(
  format($$ update public.order_items set stock_state = stock_state where order_id = %L $$, :'venda'),
  'o estado de estoque continua podendo ser acertado');

select * from finish();
rollback;

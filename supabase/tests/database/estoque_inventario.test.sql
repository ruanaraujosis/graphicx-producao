-- Inventário pela contagem, ajuste só pelo inventário e estoque inicial sem duplicar.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@inventario.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'outra@inventario.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'ana.inv', 'Ana'),
  ('00000000-0000-0000-0000-0000000000d2', 'dora.inv', 'Dora');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000d1', 'grafica-inv', 'Gráfica Inventário'),
  ('10000000-0000-0000-0000-0000000000d2', 'grafica-inv-2', 'Outra Inventário');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, '10000000-0000-0000-0000-0000000000d1'::uuid),
  ('00000000-0000-0000-0000-0000000000d2'::uuid, '10000000-0000-0000-0000-0000000000d2'::uuid)
) as u (id, org)
join public.organization_roles r on r.organization_id = u.org and r.is_admin;

insert into public.materials (id, organization_id, name, unit) values
  ('40000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Papel A4', 'folha');
insert into public.stock_movements (organization_id, material_id, type, quantity, reason) values
  ('10000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', 'entrada', 100, 'Compra');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}';
set local role authenticated;

select ok(
  (select previous_balance = 100 and final_balance = 80 and difference = -20
     from public.inventory_count('40000000-0000-0000-0000-0000000000d1', null, 80, 'Contagem mensal')),
  'contagem de 80 sobre 100: diferença de -20');
select is(
  (select on_hand from public.stock_balances where material_id = '40000000-0000-0000-0000-0000000000d1'),
  80.000, 'o saldo passa a ser o contado, não a soma');
select is(
  (select difference from public.inventory_count('40000000-0000-0000-0000-0000000000d1', null, 80, 'Recontagem')),
  0::numeric, 'contar de novo o mesmo valor não muda o saldo');
select ok(
  (select previous_balance = 100 and final_balance = 80
          and created_by = '00000000-0000-0000-0000-0000000000d1' and quantity = -20
     from public.stock_movements where type = 'ajuste' and reason = 'Contagem mensal'),
  'o ajuste registra saldo anterior, final e quem contou');
select throws_ok(
  $$ insert into public.stock_movements (organization_id, material_id, type, quantity, reason)
     values ('10000000-0000-0000-0000-0000000000d1', '40000000-0000-0000-0000-0000000000d1', 'ajuste', 5, 'x') $$,
  'P0001', null, 'ajuste fora do inventário é recusado');
select throws_ok(
  $$ select * from public.inventory_count('40000000-0000-0000-0000-0000000000d1', null, -1, 'Contagem') $$,
  '22023', null, 'quantidade contada negativa é recusada');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select * from public.inventory_count('40000000-0000-0000-0000-0000000000d1', null, 0, 'Invasão') $$,
  '42501', null, 'outra gráfica não faz inventário');
reset role;

-- Estoque inicial: um só por variação.
insert into public.products (id, organization_id, name) values
  ('50000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Caneca');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('60000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1',
   '50000000-0000-0000-0000-0000000000d1', 'CAN-01', 'Branca', 30);
insert into public.stock_movements (organization_id, variant_id, type, quantity, reason, reference) values
  ('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000000d1', 'entrada', 10, 'Estoque inicial', 'estoque-inicial');
insert into public.stock_movements (organization_id, variant_id, type, quantity, reason, reference) values
  ('10000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000000d1', 'entrada', 10, 'Estoque inicial', 'estoque-inicial')
on conflict do nothing;
select is(
  (select on_hand from public.stock_balances where variant_id = '60000000-0000-0000-0000-0000000000d1'),
  10.000, 'estoque inicial enviado duas vezes entra uma vez só');
select is(
  (select min_stock from public.product_variants where id = '60000000-0000-0000-0000-0000000000d1'),
  0.000, 'variações existentes começam com estoque mínimo 0');

select * from finish();
rollback;

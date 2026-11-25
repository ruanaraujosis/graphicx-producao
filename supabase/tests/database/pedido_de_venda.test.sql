-- Pedido de venda (Fase 9.1): preço do cadastro, desconto em dois níveis,
-- liberação do gerente de uso único, vendedor e preço de produto com ficha técnica.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009a1', 'vendedor@pv.local'),
  ('00000000-0000-0000-0000-0000000009a2', 'gerente@pv.local'),
  ('00000000-0000-0000-0000-0000000009a3', 'producao@pv.local'),
  ('00000000-0000-0000-0000-0000000009a4', 'designer@pv.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000009a1', 'vera.vendas', 'Vera'),
  ('00000000-0000-0000-0000-0000000009a2', 'gil.gerente', 'Gil'),
  ('00000000-0000-0000-0000-0000000009a3', 'pio.producao', 'Pio'),
  ('00000000-0000-0000-0000-0000000009a4', 'dani.design', 'Dani');
insert into public.organizations (id, slug, name)
values ('10000000-0000-0000-0000-0000000009a1', 'grafica-pv', 'Gráfica PV');

insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000009a1'::uuid, 'Atendimento'),
  ('00000000-0000-0000-0000-0000000009a2'::uuid, 'Administrador'),
  ('00000000-0000-0000-0000-0000000009a3'::uuid, 'Produção'),
  ('00000000-0000-0000-0000-0000000009a4'::uuid, 'Designer')
) as u (id, role)
join public.organization_roles r
  on r.organization_id = '10000000-0000-0000-0000-0000000009a1' and r.name = u.role;

select ok(
  (select 'vendas.gerenciar' = any (permissions) from public.organization_roles
    where organization_id = '10000000-0000-0000-0000-0000000009a1' and name = 'Atendimento'),
  'Atendimento nasce com vendas.gerenciar');
select ok(
  (select not ('vendas.autorizar' = any (permissions)) and not ('pedidos.alterar_preco' = any (permissions))
     from public.organization_roles
    where organization_id = '10000000-0000-0000-0000-0000000009a1' and name = 'Atendimento'),
  'Atendimento não libera desconto nem troca preço');

-- Produto pronto (R$ 10) e produto com ficha técnica (R$ 50).
insert into public.products (id, organization_id, name, fulfillment) values
  ('30000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009a1', 'Caneca', 'pronta_entrega'),
  ('30000000-0000-0000-0000-0000000009a2', '10000000-0000-0000-0000-0000000009a1', 'Banner', 'sob_encomenda');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('40000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009a1',
   '30000000-0000-0000-0000-0000000009a1', 'CAN-PV', 'Branca', 10),
  ('40000000-0000-0000-0000-0000000009a2', '10000000-0000-0000-0000-0000000009a1',
   '30000000-0000-0000-0000-0000000009a2', 'BAN-PV', '1x1', 50);
insert into public.materials (id, organization_id, name, unit)
values ('50000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009a1', 'Lona', 'm2');
insert into public.bom_items (organization_id, variant_id, material_id, quantity)
values ('10000000-0000-0000-0000-0000000009a1', '40000000-0000-0000-0000-0000000009a2',
        '50000000-0000-0000-0000-0000000009a1', 1);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000009a1', '40000000-0000-0000-0000-0000000009a1', 'entrada', 100);
insert into public.customers (id, organization_id, name)
values ('60000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009a1', 'Cliente Novo');

-- ---------------------------------------------------------------------------
-- Vendedor: desconto até 15%, preço sempre do cadastro.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated","aal":"aal1"}';
set local role authenticated;

select public.create_sale('10000000-0000-0000-0000-0000000009a1',
  '{"channel":"balcao","customer_id":"60000000-0000-0000-0000-0000000009a1","customer_name":"Cliente Novo","discount":10}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":10}]',
  true) as venda1 \gset

select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1',
       '{"customer_name":"X","discount":20}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":10}]', true) $$,
  '42501', null, 'desconto acima de 15% sem liberação é recusado');
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1', '{"customer_name":"X"}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":1,"unit_price":1}]', true) $$,
  '42501', null, 'preço de produto pronto não muda na venda');
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1', '{"customer_name":"X"}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a2","description":"Banner","quantity":1,"unit_price":40}]', true) $$,
  '42501', null, 'sem pedidos.alterar_preco, produto com ficha mantém o preço');
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1', '{"customer_name":"X"}',
       '[{"description":"Avulso","quantity":1,"unit_price":5}]', true) $$,
  '22023', null, 'venda só com produto do cadastro');
select throws_ok(
  $$ insert into public.discount_authorizations (organization_id, max_percent)
     values ('10000000-0000-0000-0000-0000000009a1', 25) $$,
  '42501', null, 'vendedor não libera desconto para si');
reset role;

select results_eq(
  format($$ select kind::text, seller_id, subtotal, discount, discount_percent, total, status::text, first_purchase
              from public.orders where id = %L $$, :'venda1'),
  $$ values ('venda'::text, '00000000-0000-0000-0000-0000000009a1'::uuid, 100.00::numeric, 10.00::numeric,
             10.00::numeric, 90.00::numeric, 'entregue'::text, true) $$,
  'venda com 10%: preço do cadastro, vendedor e 1ª compra');
select is((select status from public.receivables where order_id = :'venda1'), 'recebido', 'pago agora: recebido');

-- ---------------------------------------------------------------------------
-- Gerente libera até 30%, uma vez.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
insert into public.discount_authorizations (id, organization_id, max_percent)
values ('70000000-0000-0000-0000-0000000009a1', '10000000-0000-0000-0000-0000000009a1', 25);
select throws_ok(
  $$ insert into public.discount_authorizations (organization_id, max_percent)
     values ('10000000-0000-0000-0000-0000000009a1', 40) $$,
  '42501', null, 'liberação não passa do limite do gerente');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select public.create_sale('10000000-0000-0000-0000-0000000009a1',
  '{"customer_name":"Balcão","discount":20}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":10}]',
  true, '70000000-0000-0000-0000-0000000009a1') as venda2 \gset
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1',
       '{"customer_name":"X","discount":20}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":10}]',
       true, '70000000-0000-0000-0000-0000000009a1') $$,
  '42501', null, 'a mesma liberação não vale duas vezes');
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1',
       '{"customer_name":"X","discount":40}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":10}]', true) $$,
  '42501', null, 'acima do limite do gerente é sempre recusado');
reset role;

select results_eq(
  format($$ select discount_percent, discount_authorized_by, first_purchase from public.orders where id = %L $$, :'venda2'),
  $$ values (20.00::numeric, '00000000-0000-0000-0000-0000000009a2'::uuid, false) $$,
  'venda com 20% guarda quem liberou');
select results_eq(
  $$ select used_at is not null, order_id::text from public.discount_authorizations
      where id = '70000000-0000-0000-0000-0000000009a1' $$,
  format($$ values (true, %L::text) $$, :'venda2'),
  'liberação marcada como usada nesta venda');
select is(
  (select count(*)::int from public.order_events where order_id = :'venda2' and type = 'desconto_autorizado'),
  1, 'histórico registra a liberação');

-- ---------------------------------------------------------------------------
-- Preço de produto com ficha técnica: o Administrador pode trocar.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select public.create_sale('10000000-0000-0000-0000-0000000009a1', '{"customer_name":"Balcão"}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009a2","description":"Banner","quantity":1,"unit_price":42}]',
  false) as venda3 \gset
reset role;
select is((select unit_price from public.order_items where order_id = :'venda3'), 42.00::numeric,
  'com pedidos.alterar_preco o preço do banner muda');
select is((select status from public.receivables where order_id = :'venda3'), 'aberto', 'não pago: a receber aberto');

-- Pedido de produção também confere o preço da ficha técnica.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select throws_ok(
  $$ select public.create_order('10000000-0000-0000-0000-0000000009a1', 'novo', '{"customer_name":"Cliente"}',
       '[{"id":"","variant_id":"40000000-0000-0000-0000-0000000009a2","description":"Banner","quantity":1,"unit_price":30}]') $$,
  '42501', null, 'pedido comum: sem permissão, preço da ficha não muda');
select lives_ok(
  $$ select public.create_order('10000000-0000-0000-0000-0000000009a1', 'novo', '{"customer_name":"Cliente"}',
       '[{"id":"","variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":1,"unit_price":7}]') $$,
  'pedido comum: produto sem ficha continua com preço livre');
reset role;

-- ---------------------------------------------------------------------------
-- Quem não vende e configurações.
-- ---------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a3","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select throws_ok(
  $$ select public.create_sale('10000000-0000-0000-0000-0000000009a1', '{"customer_name":"X"}',
       '[{"variant_id":"40000000-0000-0000-0000-0000000009a1","description":"Caneca","quantity":1}]', true) $$,
  '42501', null, 'produção não lança venda');
select throws_ok(
  $$ insert into public.sales_settings (organization_id, seller_max_discount)
     values ('10000000-0000-0000-0000-0000000009a1', 50) $$,
  '42501', null, 'sem configuracoes.gerenciar não muda os limites');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009a4","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select is_empty(
  $$ select 1 from public.discount_authorizations $$,
  'designer não vê as liberações de desconto');
reset role;

select * from finish();
rollback;

-- Cancelamento e devolução de vendas concluídas (Fase 9.4).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009d1', 'vendedor@cd.local'),
  ('00000000-0000-0000-0000-0000000009d2', 'admin@cd.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000009d1', 'vania.vendas', 'Vânia'),
  ('00000000-0000-0000-0000-0000000009d2', 'ana.admin', 'Ana');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000009d1', 'grafica-cd', 'Gráfica CD');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000009d1'::uuid, 'Atendimento'),
  ('00000000-0000-0000-0000-0000000009d2'::uuid, 'Administrador')
) as u (id, role)
join public.organization_roles r on r.organization_id = '10000000-0000-0000-0000-0000000009d1' and r.name = u.role;

insert into public.products (id, organization_id, name, fulfillment)
values ('30000000-0000-0000-0000-0000000009d1', '10000000-0000-0000-0000-0000000009d1', 'Caneca', 'pronta_entrega');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price)
values ('40000000-0000-0000-0000-0000000009d1', '10000000-0000-0000-0000-0000000009d1',
        '30000000-0000-0000-0000-0000000009d1', 'CAN-CD', 'Branca', 20);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000009d1', '40000000-0000-0000-0000-0000000009d1', 'entrada', 100);

-- Venda A: 10 canecas (R$ 200) com 10% de desconto = R$ 180, paga.
-- Venda B: 5 canecas (R$ 100), não paga.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009d1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select public.create_sale('10000000-0000-0000-0000-0000000009d1', '{"customer_name":"Ana","discount":20}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009d1","description":"Caneca","quantity":10}]', true) as venda_a \gset
select public.create_sale('10000000-0000-0000-0000-0000000009d1', '{"customer_name":"Bia"}',
  '[{"variant_id":"40000000-0000-0000-0000-0000000009d1","description":"Caneca","quantity":5}]', false) as venda_b \gset
select id as item_a from public.order_items where order_id = :'venda_a' \gset
select id as item_b from public.order_items where order_id = :'venda_b' \gset

select throws_ok(
  format($$ select public.cancel_sale(%L, 'Cliente desistiu', gen_random_uuid()) $$, :'venda_a'),
  '42501', null, 'sem pedidos.cancelar não cancela');
select throws_ok(
  format($$ select public.return_sale(%L, '[{"order_item_id":"%s","quantity":1}]', 'Defeito', gen_random_uuid()) $$,
         :'venda_a', :'item_a'),
  '42501', null, 'sem pedidos.cancelar não devolve');
reset role;

select is((select on_hand from public.stock_balances where variant_id = '40000000-0000-0000-0000-0000000009d1'),
  85::numeric, 'estoque depois das vendas: 100 - 10 - 5');

-- Administrador devolve 3 canecas da venda A (paga): estorno 3 × 20 × 0,9 = 54 a pagar.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009d2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select public.return_sale(:'venda_a', format('[{"order_item_id":"%s","quantity":3}]', :'item_a')::jsonb,
  'Alça quebrada', '80000000-0000-0000-0000-0000000009d1') as dev1 \gset
select is(
  public.return_sale(:'venda_a', format('[{"order_item_id":"%s","quantity":3}]', :'item_a')::jsonb,
    'Alça quebrada', '80000000-0000-0000-0000-0000000009d1'),
  :'dev1'::uuid, 'a mesma chave devolve a mesma devolução (idempotente)');
select throws_ok(
  format($$ select public.return_sale(%L, '[{"order_item_id":"%s","quantity":8}]', 'Mais', gen_random_uuid()) $$,
         :'venda_a', :'item_a'),
  '22023', null, 'não devolve mais do que foi vendido (já voltaram 3 de 10)');
select throws_ok(
  format($$ select public.return_sale(%L, '[{"order_item_id":"%s","quantity":1}]', 'x', gen_random_uuid()) $$,
         :'venda_a', :'item_a'),
  '22023', null, 'motivo é obrigatório');
reset role;

select results_eq(
  format($$ select refund_amount, refund_via from public.order_returns where id = %L $$, :'dev1'),
  $$ values (54.00::numeric, 'a_pagar'::text) $$,
  'venda paga: estorno proporcional com o desconto vira conta a pagar');
select is((select count(*)::int from public.payables where description = 'Estorno da venda #' ||
            (select number from public.orders where id = :'venda_a')), 1, 'uma conta a pagar de estorno, não duas');
select is((select on_hand from public.stock_balances where variant_id = '40000000-0000-0000-0000-0000000009d1'),
  88::numeric, 'as 3 canecas voltaram ao estoque');
select is((select status::text from public.orders where id = :'venda_a'), 'vendido', 'devolução parcial mantém Vendido');
select is((select count(*)::int from public.order_events where order_id = :'venda_a' and type = 'devolucao'), 1,
  'devolução registrada no histórico');

-- Devolução parcial da venda B (em aberto): abate do a receber.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000009d2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select public.return_sale(:'venda_b', format('[{"order_item_id":"%s","quantity":2}]', :'item_b')::jsonb,
  'Cor errada', gen_random_uuid()) as dev2 \gset
-- Cancelamento da venda A: o resto (7 canecas, R$ 126) volta e vira estorno a pagar.
select public.cancel_sale(:'venda_a', 'Cliente desistiu do restante', gen_random_uuid()) as canc \gset
reset role;

select is((select gross from public.receivables where order_id = :'venda_b'), 60.00::numeric,
  'venda em aberto: a receber caiu de 100 para 60');
select results_eq(
  format($$ select kind, refund_amount, refund_via from public.order_returns where id = %L $$, :'canc'),
  $$ values ('cancelamento'::text, 126.00::numeric, 'a_pagar'::text) $$,
  'cancelamento estorna só o que ainda não tinha voltado');
select results_eq(
  format($$ select status::text, cancel_reason from public.orders where id = %L $$, :'venda_a'),
  $$ values ('cancelado'::text, 'Cliente desistiu do restante'::text) $$,
  'venda cancelada com o motivo');
select is((select on_hand from public.stock_balances where variant_id = '40000000-0000-0000-0000-0000000009d1'),
  97::numeric, 'estoque: 88 + 7 do cancelamento + 2 da devolução da venda B');
select throws_ok(
  format($$ delete from public.order_events where order_id = %L $$, :'venda_a'),
  '42501', null, 'histórico do pedido não pode ser apagado');
select is(
  (select sum(refund_amount) from public.order_returns where order_id = :'venda_a'),
  180.00::numeric, 'total estornado da venda A = valor da venda');

select * from finish();
rollback;

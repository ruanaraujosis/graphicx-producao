-- Fase 5 (pedidos): entrada idempotente, vínculo por SKU, status só avança e taxa real.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'admin@mktp.local');
insert into public.profiles (id, username, full_name) values ('00000000-0000-0000-0000-0000000000e1', 'eva.admin', 'Eva');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000e0', 'grafica-mktp', 'Gráfica Mktp');
insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-0000000000e0', '00000000-0000-0000-0000-0000000000e1', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000e0' and r.is_admin;

insert into public.products (id, organization_id, name)
values ('30000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e0', 'Caneca');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('40000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e0',
   '30000000-0000-0000-0000-0000000000e1', 'CAN-325', 'Branca 325ml', 30),
  ('40000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e0',
   '30000000-0000-0000-0000-0000000000e1', 'CAN-MAGICA', 'Mágica', 45);

insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, name)
values ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e0', 'shopee', '777', 'Loja');
-- Anúncio vinculado à caneca mágica (o SKU do anúncio é diferente do cadastro).
insert into public.marketplace_listings (organization_id, shop_id, variant_id, external_item_id, external_model_id, external_sku)
values ('10000000-0000-0000-0000-0000000000e0', '20000000-0000-0000-0000-0000000000e1',
        '40000000-0000-0000-0000-0000000000e2', '900', '901', 'OUTRO-SKU');

set local role service_role;

-- Ainda não pago: não cria.
select is(
  public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1',
    '{"external_id":"SN1","external_status":"UNPAID","target_status":null,"items":[]}'),
  null, 'pedido não pago não entra');

select isnt(
  public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1', $${
    "external_id":"SN1","external_status":"READY_TO_SHIP","target_status":"novo",
    "customer_name":"comprador_x","ship_by_at":"2026-10-20T15:00:00Z","package_number":"PK1",
    "notes":"Nome: Ana","fee":12.5,
    "items":[
      {"external_item_id":"800","external_model_id":"","sku":"can-325","description":"Caneca branca","quantity":2,"unit_price":40},
      {"external_item_id":"900","external_model_id":"901","sku":"OUTRO-SKU","description":"Caneca mágica","quantity":1,"unit_price":60},
      {"external_item_id":"700","external_model_id":"","sku":"NAO-EXISTE","description":"Brinde","quantity":1,"unit_price":5}
    ]}$$::jsonb),
  null, 'pedido pago entra');

reset role;
select results_eq(
  $$ select channel::text, status::text, customer_name, due_date, total, shop_id::text, package_number
     from public.orders where external_id = 'SN1' $$,
  $$ values ('shopee', 'novo', 'comprador_x', '2026-10-20'::date, 145.00::numeric,
             '20000000-0000-0000-0000-0000000000e1', 'PK1') $$,
  'cabeçalho: canal, status inicial, prazo de postagem e total');
select results_eq(
  $$ select variant_id::text from public.order_items i join public.orders o on o.id = i.order_id
     where o.external_id = 'SN1' order by i.position $$,
  $$ values ('40000000-0000-0000-0000-0000000000e1'), ('40000000-0000-0000-0000-0000000000e2'), (null::text) $$,
  'itens: SKU do cadastro (sem diferenciar maiúsculas), vínculo do anúncio e item avulso');
select is((select actor_label from public.order_events e join public.orders o on o.id = e.order_id
           where o.external_id = 'SN1' and e.type = 'criado'), 'Shopee', 'linha do tempo mostra a origem');
select results_eq(
  $$ select r.gross, r.fee, r.net from public.receivables r join public.orders o on o.id = r.order_id where o.external_id = 'SN1' $$,
  $$ values (145.00::numeric, 12.50::numeric, 132.50::numeric) $$,
  'conta a receber com a taxa real do marketplace');

-- Reprocessar o mesmo pedido não duplica.
set local role service_role;
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1',
  '{"external_id":"SN1","external_status":"PROCESSED","target_status":"novo","items":[{"external_item_id":"1","quantity":1,"unit_price":1}]}') as _ \gset
reset role;
select is((select count(*) from public.orders where external_id = 'SN1'), 1::bigint, 'mesmo pedido não duplica');
select is((select count(*) from public.order_items i join public.orders o on o.id = i.order_id where o.external_id = 'SN1'),
  3::bigint, 'itens não mudam depois da entrada');
select is((select external_status from public.orders where external_id = 'SN1'), 'PROCESSED', 'status externo atualizado');

-- A equipe avança na produção; o marketplace não volta o status.
update public.orders set status = 'em_impressao' where external_id = 'SN1';
set local role service_role;
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1',
  '{"external_id":"SN1","external_status":"READY_TO_SHIP","target_status":"novo"}') as _ \gset
reset role;
select is((select status::text from public.orders where external_id = 'SN1'), 'em_impressao', 'marketplace não volta o status');

-- Enviado e taxa final.
set local role service_role;
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1',
  '{"external_id":"SN1","external_status":"SHIPPED","target_status":"enviado","fee":20}') as _ \gset
reset role;
select is((select status::text from public.orders where external_id = 'SN1'), 'enviado', 'marketplace avança para enviado');
select is((select r.fee from public.receivables r join public.orders o on o.id = r.order_id where o.external_id = 'SN1'),
  20.00::numeric, 'taxa final atualiza a conta a receber');

-- Cancelamento.
set local role service_role;
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1', $${
  "external_id":"SN2","external_status":"READY_TO_SHIP","target_status":"novo",
  "items":[{"external_item_id":"800","sku":"CAN-325","description":"Caneca","quantity":1,"unit_price":40}]}$$::jsonb) as _ \gset
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1',
  '{"external_id":"SN2","external_status":"CANCELLED","target_status":"cancelado","cancel_reason":"Comprador desistiu"}') as _ \gset
reset role;
select results_eq(
  $$ select status::text, cancel_reason from public.orders where external_id = 'SN2' $$,
  $$ values ('cancelado', 'Comprador desistiu') $$, 'cancelado no marketplace cancela o pedido');
select is((select r.status from public.receivables r join public.orders o on o.id = r.order_id where o.external_id = 'SN2'),
  'cancelado', 'conta a receber cancelada junto');

-- Só o servidor chama.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000e1', '{"external_id":"X"}') $$,
  '42501', null, 'a equipe não chama a entrada de pedidos');
reset role;

-- Pedido de balcão sem taxa do marketplace continua usando a forma de pagamento.
select is((select channel_fee from public.orders where external_id = 'SN2'), null, 'pedido sem taxa informada fica nulo');

select * from finish();
rollback;

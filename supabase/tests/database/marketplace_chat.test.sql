-- Fase 5 (chat): pedido novo guarda o comprador e põe a mensagem na fila se a loja ligou.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000a7', 'grafica-chat', 'Gráfica Chat');
insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, name, chat_message_enabled) values
  ('20000000-0000-0000-0000-0000000000a7', '10000000-0000-0000-0000-0000000000a7', 'shopee', '7001', 'Com chat', true),
  ('20000000-0000-0000-0000-0000000000a8', '10000000-0000-0000-0000-0000000000a7', 'shopee', '7002', 'Sem chat', false);

set local role service_role;
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000a7', $${
  "external_id":"C1","external_status":"READY_TO_SHIP","target_status":"novo","buyer_id":"556677",
  "items":[{"external_item_id":"1","description":"Caneca","quantity":1,"unit_price":30}]}$$::jsonb) as _ \gset
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000a8', $${
  "external_id":"C2","external_status":"READY_TO_SHIP","target_status":"novo","buyer_id":"556688",
  "items":[{"external_item_id":"1","description":"Caneca","quantity":1,"unit_price":30}]}$$::jsonb) as _ \gset
-- Reprocessar o mesmo pedido não repete a mensagem.
select public.marketplace_upsert_order('20000000-0000-0000-0000-0000000000a7',
  '{"external_id":"C1","external_status":"PROCESSED","target_status":"novo"}') as _ \gset
reset role;

select is((select external_buyer_id from public.orders where external_id = 'C1'), '556677',
  'guarda o comprador da Shopee');
select is((select count(*) from public.marketplace_jobs
           where kind = 'chat.welcome' and shop_id = '20000000-0000-0000-0000-0000000000a7'),
  1::bigint, 'loja com chat ligado: uma mensagem na fila');
select is((select payload ->> 'order_id' from public.marketplace_jobs where kind = 'chat.welcome'),
  (select id::text from public.orders where external_id = 'C1'), 'a tarefa aponta para o pedido');
select is((select count(*) from public.marketplace_jobs
           where kind = 'chat.welcome' and shop_id = '20000000-0000-0000-0000-0000000000a8'),
  0::bigint, 'loja com chat desligado: nenhuma mensagem');
select is((select chat_sent_at from public.orders where external_id = 'C1'), null,
  'ainda não enviada');

select * from finish();
rollback;

-- Fase 5 (anúncios): importação com vínculo por SKU, estoque com margem e aviso à fila.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'admin@anuncios.local');
insert into public.profiles (id, username, full_name) values ('00000000-0000-0000-0000-0000000000f1', 'fabi.admin', 'Fabi');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000f0', 'grafica-anuncios', 'Gráfica Anúncios');
insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-0000000000f0', '00000000-0000-0000-0000-0000000000f1', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000f0' and r.is_admin;

-- Chaveiro pronta-entrega (10 peças); bloco sob encomenda com ficha (2 folhas, 100 folhas);
-- adesivo sob encomenda sem ficha.
insert into public.materials (id, organization_id, name, unit)
values ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Papel', 'folha');
insert into public.products (id, organization_id, name, fulfillment, production_days) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Chaveiro', 'pronta_entrega', 1),
  ('30000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f0', 'Bloco', 'sob_encomenda', 5),
  ('30000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f0', 'Adesivo', 'sob_encomenda', 2);
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('40000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', '30000000-0000-0000-0000-0000000000f1', 'CHAV', 'Padrão', 10),
  ('40000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f0', '30000000-0000-0000-0000-0000000000f2', 'BLOCO', 'A5', 20),
  ('40000000-0000-0000-0000-0000000000f3', '10000000-0000-0000-0000-0000000000f0', '30000000-0000-0000-0000-0000000000f3', 'ADES', 'Redondo', 5);
insert into public.bom_items (organization_id, variant_id, material_id, quantity, waste_pct)
values ('10000000-0000-0000-0000-0000000000f0', '40000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000f1', 2, 0);
insert into public.stock_movements (organization_id, material_id, type, quantity, unit_cost)
values ('10000000-0000-0000-0000-0000000000f0', '20000000-0000-0000-0000-0000000000f1', 'entrada', 100, 0.1);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000000f0', '40000000-0000-0000-0000-0000000000f1', 'entrada', 10);
insert into public.channel_price_rules (organization_id, channel, adjustment_pct)
values ('10000000-0000-0000-0000-0000000000f0', 'shopee', 20);

-- Loja criada depois do estoque: nenhum aviso ainda.
insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, name, stock_ratio)
values ('20000000-0000-0000-0000-0000000000f9', '10000000-0000-0000-0000-0000000000f0', 'shopee', '888', 'Loja', 0.9);

set local role service_role;
select is(
  public.marketplace_upsert_listings('20000000-0000-0000-0000-0000000000f9', $$[
    {"external_item_id":"1","external_model_id":"","title":"Chaveiro","external_sku":"chav","status":"ativo","external_price":12,"external_stock":3},
    {"external_item_id":"2","external_model_id":"21","title":"Bloco A5","external_sku":"BLOCO","status":"ativo"},
    {"external_item_id":"3","external_model_id":"","title":"Adesivo","external_sku":"ADES","status":"inativo"},
    {"external_item_id":"4","external_model_id":"","title":"Sem SKU","external_sku":null,"status":"ativo"}
  ]$$::jsonb, true),
  3, 'importa e vincula pelo SKU (sem diferenciar maiúsculas)');
reset role;

select is((select variant_id::text from public.marketplace_listings where external_item_id = '1'),
  '40000000-0000-0000-0000-0000000000f1', 'chaveiro vinculado');
select is((select variant_id from public.marketplace_listings where external_item_id = '4'), null,
  'anúncio sem SKU fica sem vínculo');
select ok(exists (select 1 from public.marketplace_jobs where shop_id = '20000000-0000-0000-0000-0000000000f9'
  and kind = 'stock.push_all' and status = 'pendente'), 'vínculo novo põe o envio de estoque na fila');

set local role service_role;
select results_eq(
  $$ select external_item_id, stock, price, production_days, skip_reason is not null
     from public.marketplace_listing_targets('20000000-0000-0000-0000-0000000000f9') order by external_item_id $$,
  $$ values ('1'::text, 9, 12.00::numeric, 1, false),
            ('2'::text, 45, 24.00::numeric, 5, false),
            ('3'::text, null::integer, 6.00::numeric, 2, true) $$,
  'estoque com margem de 90% (para baixo), preço do canal Shopee e prazo; sob encomenda sem ficha não envia');
reset role;

-- Importação completa: o que sumiu da loja vira excluído e sai do envio.
set local role service_role;
select public.marketplace_upsert_listings('20000000-0000-0000-0000-0000000000f9',
  '[{"external_item_id":"1","external_model_id":"","title":"Chaveiro","external_sku":"CHAV","status":"ativo"}]', true) as _ \gset
reset role;
select is((select status from public.marketplace_listings where external_item_id = '2'), 'excluido',
  'anúncio que sumiu da loja fica excluído');
select is((select variant_id::text from public.marketplace_listings where external_item_id = '1'),
  '40000000-0000-0000-0000-0000000000f1', 'reimportar mantém o vínculo');
set local role service_role;
select is((select count(*) from public.marketplace_listing_targets('20000000-0000-0000-0000-0000000000f9')),
  1::bigint, 'excluídos não recebem envio');
reset role;

-- Mudança de estoque avisa a fila (uma tarefa só, mesmo com várias mudanças).
delete from public.marketplace_jobs;
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000000f0', '40000000-0000-0000-0000-0000000000f1', 'entrada', 5);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000000f0', '40000000-0000-0000-0000-0000000000f1', 'entrada', 5);
select is((select count(*) from public.marketplace_jobs where kind = 'stock.push_all' and status = 'pendente'),
  1::bigint, 'várias mudanças de estoque viram uma tarefa');

update public.channel_price_rules set adjustment_pct = 30
where organization_id = '10000000-0000-0000-0000-0000000000f0' and channel = 'shopee';
select is((select count(*) from public.marketplace_jobs where kind = 'price.push_all'), 1::bigint,
  'mudança de preço do canal põe o envio de preço na fila');

-- A equipe não chama as funções do servidor, mas vincula com cadastros.gerenciar.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select * from public.marketplace_listing_targets('20000000-0000-0000-0000-0000000000f9') $$,
  '42501', null, 'a equipe não chama o cálculo do servidor');
select lives_ok(
  $$ update public.marketplace_listings set variant_id = '40000000-0000-0000-0000-0000000000f3'
     where external_item_id = '3' $$,
  'admin vincula o anúncio manualmente');
reset role;

select * from finish();
rollback;

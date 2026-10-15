-- Fase 5 (publicar): rascunho pela equipe, status só pelo servidor e pacote para a Shopee.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@pub.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'outra@pub.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'carla.admin', 'Carla'),
  ('00000000-0000-0000-0000-0000000000c2', 'otto.outra', 'Otto');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000c0', 'grafica-pub', 'Gráfica Pub'),
  ('10000000-0000-0000-0000-0000000000c9', 'grafica-outra-pub', 'Outra');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000c1'::uuid, '10000000-0000-0000-0000-0000000000c0'::uuid),
  ('00000000-0000-0000-0000-0000000000c2'::uuid, '10000000-0000-0000-0000-0000000000c9'::uuid)
) as u (id, org)
join public.organization_roles r on r.organization_id = u.org and r.is_admin;

insert into public.products (id, organization_id, name, fulfillment, production_days)
values ('30000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0', 'Chaveiro', 'pronta_entrega', 2);
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price, weight_g) values
  ('40000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0', '30000000-0000-0000-0000-0000000000c1', 'CHV-A', 'Azul', 10, 50),
  ('40000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000c0', '30000000-0000-0000-0000-0000000000c1', 'CHV-V', 'Vermelho', 12, 50);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-0000000000c0', '40000000-0000-0000-0000-0000000000c1', 'entrada', 20);
insert into public.product_images (organization_id, product_id, storage_path)
values ('10000000-0000-0000-0000-0000000000c0', '30000000-0000-0000-0000-0000000000c1',
        '10000000-0000-0000-0000-0000000000c0/chaveiro.jpg');
insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, stock_ratio)
values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0', 'shopee', '999', 0.5);
insert into public.marketplace_categories (marketplace, category_id, name, path)
values ('shopee', 100, 'Chaveiros', 'Acessórios > Chaveiros');

-- Equipe da gráfica cria o rascunho.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}';
set local role authenticated;

select is((select path from public.marketplace_categories where category_id = 100),
  'Acessórios > Chaveiros', 'equipe lê as categorias');
select throws_ok(
  $$ insert into public.marketplace_categories (marketplace, category_id, name, path) values ('shopee', 1, 'X', 'X') $$,
  '42501', null, 'equipe não altera as categorias');

select lives_ok(
  $$ insert into public.marketplace_publications (id, organization_id, shop_id, product_id, title, description, category_id, logistics)
     values ('60000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0',
             '20000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-0000000000c1',
             'Chaveiro personalizado', 'Chaveiro de acrílico com o seu nome.', 100, '[90001]') $$,
  'admin cria o rascunho');
select throws_ok(
  $$ insert into public.marketplace_publications (organization_id, shop_id, product_id, title, description, status)
     values ('10000000-0000-0000-0000-0000000000c0', '20000000-0000-0000-0000-0000000000c1',
             '30000000-0000-0000-0000-0000000000c1', 'Outro título qualquer', 'Descrição com mais de vinte letras.', 'publicado') $$,
  '42501', null, 'não cria já como publicado');
select lives_ok(
  $$ update public.marketplace_publications set title = 'Chaveiro de acrílico personalizado'
     where id = '60000000-0000-0000-0000-0000000000c1' $$,
  'edita o rascunho');
select throws_ok(
  $$ update public.marketplace_publications set status = 'publicado' where id = '60000000-0000-0000-0000-0000000000c1' $$,
  '42501', null, 'status só pelo servidor');
reset role;

-- Outra gráfica não vê.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.marketplace_publications), 0::bigint, 'outra gráfica não vê a publicação');
select throws_ok(
  $$ select public.marketplace_publication_payload('60000000-0000-0000-0000-0000000000c1') $$,
  '42501', null, 'equipe não chama o pacote do servidor');
reset role;

-- Pacote do servidor: fotos e variações com preço do canal e estoque com a margem.
set local role service_role;
select is(
  (select jsonb_path_query_array(public.marketplace_publication_payload('60000000-0000-0000-0000-0000000000c1'),
     '$.variants[*] ? (@.sku != "") .stock')),
  '[10, 0]'::jsonb, 'estoque = disponível × margem (20 × 50% e 0)');
select is(
  public.marketplace_publication_payload('60000000-0000-0000-0000-0000000000c1') -> 'images',
  '["10000000-0000-0000-0000-0000000000c0/chaveiro.jpg"]'::jsonb, 'fotos na ordem do cadastro');
reset role;

select * from finish();
rollback;

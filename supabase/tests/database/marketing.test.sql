-- Fase 7: marketing tem permissão própria; avaliações chegam pelo servidor.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f7', 'mkt@mk.local'),
  ('00000000-0000-0000-0000-0000000000f8', 'prod@mk.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000f7', 'mara.mkt', 'Mara'),
  ('00000000-0000-0000-0000-0000000000f8', 'pedro.prod', 'Pedro');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000000f7', 'grafica-mk', 'Gráfica MK');
insert into public.organization_roles (id, organization_id, name, permissions) values
  ('90000000-0000-0000-0000-0000000000f7', '10000000-0000-0000-0000-0000000000f7', 'Marketing', array['marketing.gerenciar']);
insert into public.organization_members (organization_id, user_id, role_id) values
  ('10000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f7', '90000000-0000-0000-0000-0000000000f7');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000f8', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000f7' and r.name = 'Produção';
insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, name, stock_ratio)
values ('20000000-0000-0000-0000-0000000000f7', '10000000-0000-0000-0000-0000000000f7', 'shopee', '4242', 'Loja MK', 0.9);
insert into public.marketplace_reviews (id, organization_id, shop_id, external_comment_id, rating, comment, reply_text)
values ('70000000-0000-0000-0000-0000000000f7', '10000000-0000-0000-0000-0000000000f7',
        '20000000-0000-0000-0000-0000000000f7', '999', 2, 'Chegou amassado', 'Sentimos muito');

-- Marketing: configura só as opções de marketing, responde e monta a lista.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select lives_ok(
  $$ select public.marketing_shop_settings('20000000-0000-0000-0000-0000000000f7', true, false, 'Equipe MK') $$,
  'marketing liga o impulsionamento');
-- A política da loja barra a linha (sem erro, nada muda); o resultado é conferido abaixo.
select lives_ok(
  $$ update public.marketplace_shops set stock_ratio = 0.5 where id = '20000000-0000-0000-0000-0000000000f7' $$,
  'tentativa de mexer na margem de estoque não quebra');
select lives_ok(
  $$ update public.marketplace_reviews set reply_text = 'Vamos resolver!', status = 'enviando'
     where id = '70000000-0000-0000-0000-0000000000f7' $$,
  'marketing revisa e envia a resposta');
select throws_ok(
  $$ update public.marketplace_reviews set rating = 5 where id = '70000000-0000-0000-0000-0000000000f7' $$,
  '42501', null, 'ninguém altera a nota do comprador');
select lives_ok(
  $$ insert into public.marketplace_boost_items (organization_id, shop_id, external_item_id, position)
     values ('10000000-0000-0000-0000-0000000000f7', '20000000-0000-0000-0000-0000000000f7', '123', 1) $$,
  'marketing monta a lista de impulsionamento');
reset role;

select results_eq(
  $$ select boost_enabled, review_auto_reply, review_signature, stock_ratio
     from public.marketplace_shops where id = '20000000-0000-0000-0000-0000000000f7' $$,
  $$ values (true, false, 'Equipe MK'::text, 0.900::numeric) $$,
  'só as opções de marketing mudaram (margem de estoque intacta)');

-- Produção não vê nada de marketing.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f8","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.marketplace_reviews), 0::bigint, 'sem marketing.ver, não lê avaliações');
select throws_ok(
  $$ select public.marketing_shop_settings('20000000-0000-0000-0000-0000000000f7', false, true, null) $$,
  '42501', null, 'sem marketing.gerenciar, não configura');
reset role;

select * from finish();
rollback;

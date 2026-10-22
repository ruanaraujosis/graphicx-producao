-- Fase 5 (base): tokens no Vault, fila com idempotência/retentativa e permissões.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@mkt.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'designer@mkt.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'ana.admin', 'Ana'),
  ('00000000-0000-0000-0000-0000000000d2', 'davi.designer', 'Davi');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000d0', 'grafica-mkt', 'Gráfica Mkt');
insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-0000000000d0', u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000d1'::uuid, true),
  ('00000000-0000-0000-0000-0000000000d2'::uuid, false)
) as u (id, admin)
join public.organization_roles r
  on r.organization_id = '10000000-0000-0000-0000-0000000000d0'
 and ((u.admin and r.is_admin) or (not u.admin and r.name = 'Designer'));

insert into public.marketplace_shops (id, organization_id, marketplace, external_shop_id, name)
values ('20000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d0', 'shopee', '123456', 'Loja Teste');

-- -----------------------------------------------------------------------------
-- Tokens no Vault
-- -----------------------------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ select public.marketplace_save_tokens('20000000-0000-0000-0000-0000000000d1', 'acesso-1', 'renova-1',
       now() + interval '4 hours', now() + interval '30 days') $$,
  'servidor guarda os tokens');
select results_eq(
  $$ select access_token, refresh_token from public.marketplace_get_tokens('20000000-0000-0000-0000-0000000000d1') $$,
  $$ values ('acesso-1'::text, 'renova-1'::text) $$,
  'tokens voltam descriptografados só para o servidor');
select public.marketplace_save_tokens('20000000-0000-0000-0000-0000000000d1', 'acesso-2', 'renova-2',
  now() + interval '4 hours', now() + interval '30 days') as _ \gset
select is((select access_token from public.marketplace_get_tokens('20000000-0000-0000-0000-0000000000d1')),
  'acesso-2', 'renovar atualiza o mesmo segredo');
reset role;
select is((select count(*) from vault.secrets where name like 'marketplace_%_20000000-0000-0000-0000-0000000000d1'),
  2::bigint, 'dois segredos no Vault (acesso e renovação), sem duplicar');

select ok(
  (select access_token_secret_id is not null from public.marketplace_shops where id = '20000000-0000-0000-0000-0000000000d1'),
  'a loja guarda só a referência do segredo');

-- Equipe logada não consegue ler os tokens.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select * from public.marketplace_get_tokens('20000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'nem o admin da gráfica lê os tokens');
select is((select name from public.marketplace_shops), 'Loja Teste', 'admin vê a loja conectada');

-- -----------------------------------------------------------------------------
-- Fila
-- -----------------------------------------------------------------------------
reset role;
set local role service_role;
select isnt(public.marketplace_enqueue('20000000-0000-0000-0000-0000000000d1', 'orders.import', '{"order_sn":"A1"}', 'A1'),
  null, 'enfileira uma tarefa');
select is(public.marketplace_enqueue('20000000-0000-0000-0000-0000000000d1', 'orders.import', '{"order_sn":"A1"}', 'A1'),
  null, 'a mesma tarefa em aberto não duplica (idempotência)');

select is((select count(*) from public.marketplace_claim_jobs(10)), 1::bigint, 'processador pega a tarefa pronta');
select is((select count(*) from public.marketplace_claim_jobs(10)), 0::bigint, 'tarefa em processamento não é pega de novo');

select public.marketplace_finish_job((select id from public.marketplace_jobs limit 1), false, 'Shopee fora do ar') as _ \gset
select ok(
  (select status = 'pendente' and run_after > now() and last_error = 'Shopee fora do ar' from public.marketplace_jobs limit 1),
  'falha volta para a fila com espera e o erro registrado');

update public.marketplace_jobs set attempts = 6;
select public.marketplace_finish_job((select id from public.marketplace_jobs limit 1), false, 'ainda fora') as _ \gset
select is((select status from public.marketplace_jobs limit 1), 'erro', 'depois de 6 tentativas fica como erro');

-- Designer não vê a fila (é de configurações).
reset role;
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.marketplace_jobs), 0::bigint, 'designer não vê a fila das integrações');

select * from finish();
rollback;

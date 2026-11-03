-- LGPD: anonimização de clientes. Só com a permissão lgpd.gerenciar; nada de dado pessoal sobra no
-- cadastro, nos pedidos nem na auditoria; pedido em andamento impede.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@lgpd.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'vendas@lgpd.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'outra@lgpd.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'ana.lgpd', 'Ana'),
  ('00000000-0000-0000-0000-0000000000b2', 'beto.lgpd', 'Beto'),
  ('00000000-0000-0000-0000-0000000000b3', 'dora.lgpd', 'Dora');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000b1', 'grafica-lgpd', 'Gráfica LGPD'),
  ('10000000-0000-0000-0000-0000000000b2', 'grafica-lgpd-2', 'Outra LGPD');
insert into public.organization_roles (id, organization_id, name, permissions) values
  ('90000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'Vendas', array['pedidos.gerenciar', 'cadastros.gerenciar']);
select lives_ok(
  $$ insert into public.organization_roles (organization_id, name, permissions) values
     ('10000000-0000-0000-0000-0000000000b1', 'Privacidade', array['cadastros.ver', 'lgpd.gerenciar']) $$,
  'perfil com a permissão de LGPD é salvo (sem lgpd.ver)');
select is(
  (select permissions from public.organization_roles
    where organization_id = '10000000-0000-0000-0000-0000000000b1' and name = 'Privacidade'),
  array['cadastros.ver', 'lgpd.gerenciar']::text[], 'gerenciar LGPD não cria uma permissão ver inexistente');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, '10000000-0000-0000-0000-0000000000b1'::uuid),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, '10000000-0000-0000-0000-0000000000b2'::uuid)
) as u (id, org)
join public.organization_roles r on r.organization_id = u.org and r.is_admin;
insert into public.organization_members (organization_id, user_id, role_id) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '90000000-0000-0000-0000-0000000000b1');

insert into public.customers (id, organization_id, name, document, email, whatsapp, city, state, notes) values
  ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   'Maria Titular', '52998224725', 'maria@titular.local', '62999990000', 'Luziânia', 'GO', 'Prefere retirar');
update public.customers set notes = 'Prefere entrega' where id = '20000000-0000-0000-0000-0000000000b1';
insert into public.orders (id, organization_id, customer_id, customer_name, customer_phone, status) values
  ('30000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
   '20000000-0000-0000-0000-0000000000b1', 'Maria Titular', '62999990000', 'em_impressao');

-- Quem só gerencia pedidos não anonimiza; outra gráfica também não.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select public.anonymize_customer('20000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'quem gerencia cadastros, mas não tem LGPD, não anonimiza');
reset role;
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select public.anonymize_customer('20000000-0000-0000-0000-0000000000b1') $$,
  '42501', null, 'outra gráfica não anonimiza');
reset role;

-- Admin: bloqueado enquanto há pedido em produção; liberado depois de entregue.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok(
  $$ select public.anonymize_customer('20000000-0000-0000-0000-0000000000b1') $$,
  'P0001', null, 'pedido em andamento impede a anonimização');
reset role;
update public.orders set status = 'entregue' where id = '30000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select lives_ok(
  $$ select public.anonymize_customer('20000000-0000-0000-0000-0000000000b1') $$,
  'admin anonimiza o cliente');
reset role;

select is(
  (select row(name, document, email, whatsapp, city, notes, active)::text
     from public.customers where id = '20000000-0000-0000-0000-0000000000b1'),
  row('Cliente anonimizado', null::text, null::text, null::text, null::text, null::text, false)::text,
  'cadastro sem dados pessoais e inativo');
select isnt(
  (select anonymized_at from public.customers where id = '20000000-0000-0000-0000-0000000000b1'),
  null, 'data da anonimização registrada');
select is(
  (select row(customer_name, customer_phone, status)::text
     from public.orders where id = '30000000-0000-0000-0000-0000000000b1'),
  row('Cliente anonimizado', null::text, 'entregue')::text,
  'pedido mantido, sem nome e telefone do cliente');
select is(
  (select customer_name from public.receivables where order_id = '30000000-0000-0000-0000-0000000000b1'),
  'Cliente anonimizado', 'a receber sem o nome do cliente');
select is(
  (select count(*) from public.audit_log
    where (coalesce(old_data::text, '') || coalesce(new_data::text, '')) ~ 'Maria Titular|52998224725|maria@titular|62999990000|Prefere'),
  0::bigint, 'auditoria sem dados pessoais do cliente');
select cmp_ok(
  (select count(*) from public.audit_log where table_name = 'customers'
     and record_id = '20000000-0000-0000-0000-0000000000b1'),
  '>=', 3::bigint, 'trilha de auditoria preservada (sem os dados pessoais)');

select * from finish();
rollback;

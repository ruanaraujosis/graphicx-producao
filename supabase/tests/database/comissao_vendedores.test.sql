-- Comissão por vendedor: só o financeiro define; cada um vê a própria.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@comissao.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'vendas@comissao.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'colega@comissao.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'outra@comissao.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana.admin', 'Ana'),
  ('00000000-0000-0000-0000-0000000000a2', 'beto.vendas', 'Beto'),
  ('00000000-0000-0000-0000-0000000000a3', 'caio.vendas', 'Caio'),
  ('00000000-0000-0000-0000-0000000000a4', 'dora.outra', 'Dora');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000a1', 'grafica-comissao', 'Gráfica Comissão'),
  ('10000000-0000-0000-0000-0000000000a2', 'grafica-comissao-2', 'Outra Comissão');
insert into public.organization_roles (id, organization_id, name, permissions) values
  ('90000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', 'Vendas', array['pedidos.gerenciar']);
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '10000000-0000-0000-0000-0000000000a1'::uuid),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, '10000000-0000-0000-0000-0000000000a2'::uuid)
) as u (id, org)
join public.organization_roles r on r.organization_id = u.org and r.is_admin;
insert into public.organization_members (organization_id, user_id, role_id) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '90000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', '90000000-0000-0000-0000-0000000000a1');

-- Admin (financeiro.gerenciar) define as comissões.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select lives_ok(
  $$ insert into public.seller_commissions (organization_id, user_id, rate) values
     ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 5),
     ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 3) $$,
  'financeiro define a comissão da equipe');
select throws_ok(
  $$ insert into public.seller_commissions (organization_id, user_id, rate)
     values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 5) $$,
  '42501', null, 'não define comissão de quem não é da gráfica');
select throws_ok(
  $$ update public.seller_commissions set rate = 150
     where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  '23514', null, 'percentual acima de 100 é recusado');
reset role;

-- Vendedor vê só a própria e não altera.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.seller_commissions), 1::bigint, 'vendedor vê só a própria comissão');
update public.seller_commissions set rate = 50 where user_id = '00000000-0000-0000-0000-0000000000a2';
select throws_ok(
  $$ insert into public.seller_commissions (organization_id, user_id, rate)
     values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 50)
     on conflict (organization_id, user_id) do update set rate = excluded.rate $$,
  '42501', null, 'vendedor não define a própria comissão');
reset role;
select is(
  (select rate from public.seller_commissions where user_id = '00000000-0000-0000-0000-0000000000a2'),
  5.00, 'a comissão continua a definida pelo financeiro');

-- Outra gráfica não vê nada.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.seller_commissions), 0::bigint, 'outra gráfica não vê as comissões');
reset role;

select * from finish();
rollback;

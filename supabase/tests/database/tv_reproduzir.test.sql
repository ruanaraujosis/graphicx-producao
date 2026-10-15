-- "Reproduzir na TV": qualquer pessoa da gráfica manda a tela; outra gráfica não.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c8', 'pcp@cast.local'),
  ('00000000-0000-0000-0000-0000000000c9', 'outra@cast.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000c8', 'paulo.pcp', 'Paulo PCP'),
  ('00000000-0000-0000-0000-0000000000c9', 'olivia.outra', 'Olívia');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000c8', 'grafica-cast', 'Gráfica Cast'),
  ('10000000-0000-0000-0000-0000000000c9', 'grafica-cast-2', 'Outra Cast');
-- Paulo tem um perfil sem configurações (Produção); Olívia é admin da outra gráfica.
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000c8', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000c8' and r.name = 'Produção';
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000c9', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000c9' and r.is_admin;
insert into public.tv_devices (id, organization_id, name, token)
values ('80000000-0000-0000-0000-0000000000c8', '10000000-0000-0000-0000-0000000000c8', 'TV produção',
        'tokentesteparareproduzirnatv000000000000');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c8","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select is((select count(*) from public.tv_cast_targets('10000000-0000-0000-0000-0000000000c8')), 1::bigint,
  'quem é da gráfica vê as TVs para reproduzir');
select lives_ok(
  $$ select public.tv_cast('80000000-0000-0000-0000-0000000000c8', 'stock') $$,
  'quem é da gráfica manda a tela para a TV');
select throws_ok(
  $$ select public.tv_cast('80000000-0000-0000-0000-0000000000c8', 'DROP TABLE') $$,
  '22023', null, 'tela inválida é recusada');
reset role;

set local role service_role;
select results_eq(
  $$ select public.tv_command('tokentesteparareproduzirnatv000000000000') ->> 'screen',
            public.tv_command('tokentesteparareproduzirnatv000000000000') ->> 'by' $$,
  $$ values ('stock'::text, 'Paulo PCP'::text) $$,
  'a TV recebe a tela e quem mandou');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c9","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.tv_cast_targets('10000000-0000-0000-0000-0000000000c8')), 0::bigint,
  'outra gráfica não vê as TVs');
select throws_ok(
  $$ select public.tv_cast('80000000-0000-0000-0000-0000000000c8', 'board') $$,
  'P0002', null, 'outra gráfica não manda nada para a TV');
reset role;

select * from finish();
rollback;

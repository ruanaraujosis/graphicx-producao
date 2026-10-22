-- TV: pareamento só pelo servidor; a equipe liga, desliga e exclui a TV.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b7', 'admin@tvp.local');
insert into public.profiles (id, username, full_name) values ('00000000-0000-0000-0000-0000000000b7', 'tito.admin', 'Tito');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000000b7', 'grafica-tvp', 'Gráfica TV');
insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000b7', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000b7' and r.is_admin;
insert into public.tv_devices (id, organization_id, name, revoked_at)
values ('80000000-0000-0000-0000-0000000000b7', '10000000-0000-0000-0000-0000000000b7', 'TV produção', now());
insert into public.tv_pairings (code, secret_hash)
values ('ABC234', repeat('a', 64));

select throws_ok(
  $$ insert into public.tv_pairings (code, secret_hash) values ('ABC234', repeat('b', 64)) $$,
  '23505', null, 'um código vale para um pareamento em aberto');
select throws_ok(
  $$ insert into public.tv_pairings (code, secret_hash) values ('ABC10O', repeat('c', 64)) $$,
  '23514', null, 'código só com letras e números legíveis');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select throws_ok($$ select * from public.tv_pairings $$, '42501', null,
  'a equipe não lê os pareamentos (só o servidor)');
select lives_ok(
  $$ update public.tv_devices set revoked_at = null where id = '80000000-0000-0000-0000-0000000000b7' $$,
  'admin liga de novo a TV desligada');
select is((select revoked_at from public.tv_devices where id = '80000000-0000-0000-0000-0000000000b7'),
  null, 'TV ligada');
delete from public.tv_devices where id = '80000000-0000-0000-0000-0000000000b7';
select is((select count(*) from public.tv_devices), 0::bigint, 'admin exclui a TV');
reset role;

select * from finish();
rollback;

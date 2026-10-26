-- Backup por gráfica: só o SuperAdmin vê os metadados; só o servidor lista as tabelas.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b8', 'super@bk.local'),
  ('00000000-0000-0000-0000-0000000000b9', 'admin@bk.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000b8', 'sara.super', 'Sara'),
  ('00000000-0000-0000-0000-0000000000b9', 'alan.admin', 'Alan');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000b8');
insert into public.organizations (id, slug, name) values ('10000000-0000-0000-0000-0000000000b8', 'grafica-bk', 'Gráfica BK');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, '00000000-0000-0000-0000-0000000000b9', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-0000000000b8' and r.is_admin;
insert into public.platform_backups (organization_id, organization_name, kind, status, size_bytes)
values ('10000000-0000-0000-0000-0000000000b8', 'Gráfica BK', 'automatico', 'pronto', 1234);

set local role service_role;
select ok('orders' = any (array(select public.backup_tables())), 'pedidos entram no backup');
select ok('customers' = any (array(select public.backup_tables())), 'clientes entram no backup');
select ok(not ('profiles' = any (array(select public.backup_tables()))), 'tabelas sem gráfica ficam de fora');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b8","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.platform_backups), 1::bigint, 'SuperAdmin vê os backups');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b9","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.platform_backups), 0::bigint, 'admin da gráfica não vê a lista da plataforma');
select throws_ok($$ select public.backup_tables() $$, '42501', null, 'equipe não chama a lista de tabelas');
reset role;

select * from finish();
rollback;

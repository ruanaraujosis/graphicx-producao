-- MFA por perfil: o Administrador sempre exige; os outros seguem a opção do perfil.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'gestor@teste.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'gina.gestora', 'Gina');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000c0', 'grafica-mfa', 'Gráfica MFA');

select ok(
  (select require_mfa from public.organization_roles
   where organization_id = '10000000-0000-0000-0000-0000000000c0' and is_admin),
  'perfil Administrador nasce exigindo MFA');
select is(
  (select array_agg(name order by name) from public.organization_roles
   where organization_id = '10000000-0000-0000-0000-0000000000c0' and require_mfa),
  array['Administrador', 'Financeiro'],
  'perfis iniciais: MFA só no Administrador e no Financeiro');

select throws_ok(
  $$ update public.organization_roles set require_mfa = false
     where organization_id = '10000000-0000-0000-0000-0000000000c0' and is_admin $$,
  '23514', null, 'o Administrador não pode ficar sem MFA');

-- Perfil que gerencia a equipe, com o MFA desligado pela gráfica.
insert into public.organization_roles (id, organization_id, name, permissions, require_mfa)
values ('20000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000c0',
        'Gestor', array['equipe.gerenciar', 'pedidos.ver'], false);
insert into public.organization_members (organization_id, user_id, role_id)
values ('10000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000c1',
        '20000000-0000-0000-0000-0000000000c1');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select ok(private.is_member('10000000-0000-0000-0000-0000000000c0'),
  'sem a exigência, o perfil entra sem MFA');

reset role;
-- Preparação sem login (o guarda impede quem usa o perfil de alterá-lo).
set local "request.jwt.claims" to '';
update public.organization_roles set require_mfa = true where id = '20000000-0000-0000-0000-0000000000c1';
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select ok(not private.is_member('10000000-0000-0000-0000-0000000000c0'),
  'com a exigência ligada, sem MFA não entra');

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated","aal":"aal2"}';
select ok(private.is_member('10000000-0000-0000-0000-0000000000c0'),
  'com MFA confirmado, entra');

select * from finish();
rollback;

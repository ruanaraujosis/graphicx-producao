-- Modelos de etiqueta: cada gráfica edita os seus, um padrão por tipo.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e7', 'admin@etiq.local'),
  ('00000000-0000-0000-0000-0000000000e8', 'outra@etiq.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000e7', 'edu.admin', 'Edu'),
  ('00000000-0000-0000-0000-0000000000e8', 'olga.outra', 'Olga');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000e7', 'grafica-etiq', 'Gráfica Etiq'),
  ('10000000-0000-0000-0000-0000000000e8', 'grafica-etiq-2', 'Outra Etiq');
insert into public.organization_members (organization_id, user_id, role_id)
select r.organization_id, u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000e7'::uuid, '10000000-0000-0000-0000-0000000000e7'::uuid),
  ('00000000-0000-0000-0000-0000000000e8'::uuid, '10000000-0000-0000-0000-0000000000e8'::uuid)
) as u (id, org)
join public.organization_roles r on r.organization_id = u.org and r.is_admin;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000e7","role":"authenticated","aal":"aal2"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.label_templates (id, organization_id, kind, name, width_mm, height_mm, is_default)
     values ('70000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e7', 'envio', 'Correios', 100, 150, true) $$,
  'admin cria o modelo da gráfica');
select throws_ok(
  $$ insert into public.label_templates (organization_id, kind, name, width_mm, height_mm, is_default)
     values ('10000000-0000-0000-0000-0000000000e7', 'envio', 'Outro', 100, 150, true) $$,
  '23505', null, 'só um padrão por tipo');
select lives_ok(
  $$ insert into public.label_templates (organization_id, kind, name, width_mm, height_mm, is_default)
     values ('10000000-0000-0000-0000-0000000000e7', 'identificacao', 'QR', 60, 40, true) $$,
  'outro tipo tem o seu padrão');
select throws_ok(
  $$ insert into public.label_templates (organization_id, kind, name, width_mm, height_mm)
     values ('10000000-0000-0000-0000-0000000000e7', 'envio', 'Gigante', 500, 150) $$,
  '23514', null, 'tamanho fora dos limites é recusado');
reset role;

set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000e8","role":"authenticated","aal":"aal2"}';
set local role authenticated;
select is((select count(*) from public.label_templates), 0::bigint, 'outra gráfica não vê os modelos');
select throws_ok(
  $$ insert into public.label_templates (organization_id, kind, name, width_mm, height_mm)
     values ('10000000-0000-0000-0000-0000000000e7', 'envio', 'Invasor', 100, 150) $$,
  '42501', null, 'outra gráfica não cria modelo na gráfica alheia');
reset role;

select * from finish();
rollback;

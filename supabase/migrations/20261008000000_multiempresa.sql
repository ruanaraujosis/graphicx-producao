-- =============================================================================
-- Multi-empresa (SaaS): gráficas (tenants), vínculo pessoa↔gráfica com perfil
-- por gráfica, SuperAdmin da plataforma e exigência de MFA (aal2) para admins.
--
-- Substitui o modelo de empresa única da migration de fundação. Na data desta
-- migration nenhum ambiente tinha dados, por isso `profiles` é recriada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Remove o modelo de empresa única
-- -----------------------------------------------------------------------------
-- Políticas antes das funções que elas usam (o Postgres não deixa apagar função em uso).
drop policy if exists "Admin lê auditoria" on public.audit_log;
drop table if exists public.profiles cascade;
drop function if exists private.guard_profile_update();
drop function if exists private.has_role(public.app_role[]);
drop function if exists private.is_admin();
drop function if exists private.is_active_user();
drop function if exists private.current_app_role();

-- -----------------------------------------------------------------------------
-- Gráficas (tenants)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  legal_name text check (legal_name is null or char_length(btrim(legal_name)) between 2 and 200),
  document text check (document is null or document ~ '^[0-9]{14}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is 'Gráficas clientes da plataforma (tenants). Todo dado de negócio pertence a uma.';
comment on column public.organizations.slug is 'Código curto e único da gráfica (ex.: smart).';
comment on column public.organizations.document is 'CNPJ, só dígitos.';
comment on column public.organizations.active is 'Gráfica desativada: nenhum membro acessa os dados dela.';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pessoas (uma por conta do Supabase Auth)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9]+(\.[a-z0-9]+)+$' and char_length(username) between 3 and 60),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text unique check (email is null or (email = lower(email) and email like '%_@_%')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Pessoas com acesso à plataforma. Usuário (nome.cargo) é único globalmente.';
comment on column public.profiles.email is 'E-mail real (permite recuperar a senha). Nulo para quem entra só com usuário.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Vínculo pessoa ↔ gráfica, com o perfil de acesso naquela gráfica
-- -----------------------------------------------------------------------------
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

comment on table public.organization_members is 'Quem trabalha em qual gráfica e com qual perfil. Uma pessoa pode estar em várias.';

create index organization_members_user_idx on public.organization_members (user_id) where active;

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- SuperAdmins da plataforma (dono do SaaS)
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is 'SuperAdmins: gerenciam gráficas e usuários, mas não leem dados operacionais das gráficas.';

-- -----------------------------------------------------------------------------
-- Funções usadas pelo RLS
-- -----------------------------------------------------------------------------

-- Sessão confirmada com o segundo fator (MFA).
create or replace function private.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
$$;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_aal2()
     and exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid()))
$$;

-- Perfil de quem está logado numa gráfica (nulo se não for membro ativo de uma gráfica ativa).
create or replace function private.member_role(org uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = org
    and m.user_id = (select auth.uid())
    and m.active
    and o.active
$$;

-- Membro com acesso liberado. Admin só conta depois do MFA.
create or replace function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.role is null then false
    when s.role = 'admin' then private.is_aal2()
    else true
  end
  from (select private.member_role(org) as role) s
$$;

-- Tem um dos perfis na gráfica? O admin da gráfica (com MFA) passa em todas as regras.
create or replace function private.has_org_role(org uuid, variadic allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.role is null then false
    when s.role = 'admin' then private.is_aal2()
    else s.role = any (allowed)
  end
  from (select private.member_role(org) as role) s
$$;

create or replace function private.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.member_role(org) = 'admin' and private.is_aal2(), false)
$$;

-- A pessoa logada e `other` trabalham juntas em alguma gráfica?
create or replace function private.shares_org_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members theirs
    where theirs.user_id = other
      and private.is_member(theirs.organization_id)
  )
$$;

revoke all on function private.is_aal2() from public;
revoke all on function private.is_platform_admin() from public;
revoke all on function private.member_role(uuid) from public;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.app_role[]) from public;
revoke all on function private.is_org_admin(uuid) from public;
revoke all on function private.shares_org_with(uuid) from public;
grant execute on function private.is_aal2() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.member_role(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function private.shares_org_with(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Regras que o RLS sozinho não expressa (campos protegidos)
-- -----------------------------------------------------------------------------
create or replace function private.guard_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_platform_admin() then
    return new;
  end if;
  if new.slug is distinct from old.slug or new.active is distinct from old.active then
    raise exception 'Somente a plataforma pode alterar o código ou o status da gráfica.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_update
  before update on public.organizations
  for each row execute function private.guard_organization_update();

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Chave secreta (servidor) passa direto: ela mantém e-mail e usuário em sincronia com o Auth.
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.username is distinct from old.username
     or new.email is distinct from old.email then
    raise exception 'Usuário e e-mail só podem ser alterados pelo suporte.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

create or replace function private.guard_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'Não é possível mover um vínculo para outra gráfica ou pessoa.' using errcode = '42501';
  end if;
  -- Evita a gráfica ficar sem admin por engano: ninguém rebaixa ou desativa a si mesmo.
  if tg_op = 'UPDATE' and old.user_id = v_uid
     and (new.role is distinct from old.role or not new.active)
     and not private.is_platform_admin() then
    raise exception 'Você não pode alterar o próprio perfil de acesso nem se desativar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organization_members_guard
  before insert or update on public.organization_members
  for each row execute function private.guard_member_change();

-- -----------------------------------------------------------------------------
-- Auditoria por gráfica
-- -----------------------------------------------------------------------------
-- Sem chave estrangeira de propósito: o histórico continua existindo mesmo se a gráfica for apagada.
alter table public.audit_log add column organization_id uuid;

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('INSERT', 'UPDATE', 'DELETE', 'PASSWORD_RESET', 'MFA_RESET'));

create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changed text[];
  v_org uuid;
  v_record text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
      from jsonb_each(v_new) n
     where n.key <> 'updated_at'
       and n.value is distinct from v_old -> n.key;

    if v_changed is null then
      return new;
    end if;
  end if;

  v_org := case
    when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid
    else (v_row ->> 'organization_id')::uuid
  end;
  v_record := coalesce(v_row ->> 'id', v_row ->> 'user_id');

  insert into public.audit_log
    (organization_id, table_name, record_id, action, old_data, new_data, changed_fields, actor_id)
  values
    (v_org, tg_table_name, v_record, tg_op, v_old, v_new, v_changed, (select auth.uid()));

  return coalesce(new, old);
end;
$$;

create trigger organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function private.audit_row_change();

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();

create trigger organization_members_audit
  after insert or update or delete on public.organization_members
  for each row execute function private.audit_row_change();

create trigger platform_admins_audit
  after insert or update or delete on public.platform_admins
  for each row execute function private.audit_row_change();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_admins enable row level security;

-- organizations
create policy "Membros e plataforma leem a gráfica"
  on public.organizations for select to authenticated
  using ((select private.is_member(id)) or (select private.is_platform_admin()));

create policy "Plataforma cadastra gráficas"
  on public.organizations for insert to authenticated
  with check ((select private.is_platform_admin()));

create policy "Admin da gráfica e plataforma editam a gráfica"
  on public.organizations for update to authenticated
  using ((select private.is_org_admin(id)) or (select private.is_platform_admin()))
  with check ((select private.is_org_admin(id)) or (select private.is_platform_admin()));

-- profiles
create policy "Ver a si mesmo, colegas de gráfica e (plataforma) todos"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.shares_org_with(id))
    or (select private.is_platform_admin())
  );

create policy "Cada um edita o próprio nome"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Criação de pessoas acontece só no servidor (chave secreta), depois da autorização na aplicação.

-- organization_members
create policy "Ver os próprios vínculos e os da gráfica"
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_member(organization_id))
    or (select private.is_platform_admin())
  );

create policy "Admin da gráfica e plataforma adicionam membros"
  on public.organization_members for insert to authenticated
  with check ((select private.is_org_admin(organization_id)) or (select private.is_platform_admin()));

create policy "Admin da gráfica e plataforma editam membros"
  on public.organization_members for update to authenticated
  using ((select private.is_org_admin(organization_id)) or (select private.is_platform_admin()))
  with check ((select private.is_org_admin(organization_id)) or (select private.is_platform_admin()));
-- Sem delete: vínculos são desativados, nunca apagados.

-- platform_admins: cada um sabe se é SuperAdmin; só o servidor concede.
create policy "Ver o próprio status de SuperAdmin"
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- audit_log
create policy "Admin vê a auditoria da gráfica; plataforma vê tudo"
  on public.audit_log for select to authenticated
  using ((select private.is_org_admin(organization_id)) or (select private.is_platform_admin()));

revoke all on public.organizations, public.profiles, public.organization_members, public.platform_admins from anon;
revoke insert, delete on public.profiles from authenticated;
revoke delete on public.organizations, public.organization_members from authenticated;
revoke insert, update, delete on public.platform_admins from authenticated;

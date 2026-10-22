-- =============================================================================
-- Fase 1 — Fundação: perfis de acesso (RBAC), auditoria e funções de apoio ao RLS.
-- =============================================================================

-- Schema privado: funções auxiliares que não devem ser expostas pela API REST.
create schema if not exists private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Perfis de acesso
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'admin',
  'atendimento',
  'designer',
  'producao',
  'expedicao',
  'financeiro'
);

comment on type public.app_role is 'Perfis de acesso da equipe (RBAC).';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9]+(\.[a-z0-9]+)+$' and char_length(username) between 3 and 60),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Usuários da equipe. Login no formato nome.cargo.';
comment on column public.profiles.active is 'Usuário desativado não acessa o sistema (o registro é mantido para auditoria).';

create index profiles_role_idx on public.profiles (role) where active;

-- -----------------------------------------------------------------------------
-- Funções usadas pelas políticas RLS
-- -----------------------------------------------------------------------------
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;

create or replace function private.has_role(variadic allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_app_role() = 'admin' or private.current_app_role() = any (allowed),
    false
  )
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = 'admin', false)
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_app_role() is not null
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.has_role(public.app_role[]) from public;
revoke all on function private.is_admin() from public;
revoke all on function private.is_active_user() from public;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_active_user() to authenticated;

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Proteção de campos sensíveis do perfil
--   * Só o admin muda username, perfil (role) e status.
--   * Ninguém (nem o admin) rebaixa ou desativa a si mesmo — evita ficar sem admin.
-- -----------------------------------------------------------------------------
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Chamadas com a chave de serviço (sem usuário) não passam por estas regras.
  if v_uid is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'O id do perfil não pode ser alterado.' using errcode = '42501';
  end if;

  if not private.is_admin()
     and (new.username is distinct from old.username
          or new.role is distinct from old.role
          or new.active is distinct from old.active) then
    raise exception 'Somente o administrador pode alterar usuário, perfil ou status.'
      using errcode = '42501';
  end if;

  if old.id = v_uid and (new.role is distinct from old.role or not new.active) then
    raise exception 'Você não pode alterar o próprio perfil de acesso nem se desativar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Auditoria (quem alterou o quê e quando)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'PASSWORD_RESET')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.audit_log is 'Trilha de auditoria das tabelas críticas. Gravada só por trigger ou pelo servidor.';

create index audit_log_record_idx on public.audit_log (table_name, record_id, created_at desc);
create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key)
      into v_changed
      from jsonb_each(v_new) n
     where n.key <> 'updated_at'
       and n.value is distinct from v_old -> n.key;

    -- Nada relevante mudou: não registra.
    if v_changed is null then
      return new;
    end if;
  end if;

  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields, actor_id)
  values (
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    tg_op,
    v_old,
    v_new,
    v_changed,
    (select auth.uid())
  );

  return coalesce(new, old);
end;
$$;

comment on function private.audit_row_change() is
  'Trigger genérico de auditoria. Ligar com: create trigger <t>_audit after insert or update or delete on <t> for each row execute function private.audit_row_change();';

create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- profiles: a equipe ativa enxerga os colegas (para atribuir tarefas, mostrar nomes).
create policy "Equipe ativa lê perfis"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_active_user()));

create policy "Admin cadastra perfis"
  on public.profiles for insert
  to authenticated
  with check ((select private.is_admin()));

-- Cada um edita o próprio perfil (o trigger limita aos campos permitidos); o admin edita todos.
create policy "Usuário edita o próprio perfil; admin edita todos"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Sem política de delete: usuários são desativados, nunca apagados.

-- audit_log: somente leitura, e só para o admin. Escrita apenas via trigger/servidor.
create policy "Admin lê auditoria"
  on public.audit_log for select
  to authenticated
  using ((select private.is_admin()));

-- Privilégios explícitos: anon não acessa nada destas tabelas.
revoke all on public.profiles from anon;
revoke all on public.audit_log from anon;
revoke insert, update, delete on public.audit_log from authenticated;

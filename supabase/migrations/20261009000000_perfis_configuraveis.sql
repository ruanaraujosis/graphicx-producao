-- =============================================================================
-- Perfis de acesso configuráveis por gráfica.
--   * Cada gráfica tem seus perfis (organization_roles) com uma lista de permissões
--     do catálogo (módulo.ver / módulo.gerenciar). "Gerenciar" inclui "ver".
--   * O perfil Administrador é criado automaticamente, tem tudo e não pode ser alterado.
--   * MFA obrigatório para Administrador e para perfis com permissões sensíveis.
--   * Ninguém concede permissões que não tem (sem escalada de privilégio).
--   * Senha provisória: profiles.must_change_password obriga a troca no próximo login.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo de permissões (manter igual a src/lib/auth/permissions.ts — há teste)
-- -----------------------------------------------------------------------------
create or replace function private.valid_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'pedidos.ver', 'pedidos.gerenciar',
    'artes.ver', 'artes.gerenciar',
    'pcp.ver', 'pcp.gerenciar',
    'estoque.ver', 'estoque.gerenciar',
    'expedicao.ver', 'expedicao.gerenciar',
    'cadastros.ver', 'cadastros.gerenciar',
    'financeiro.ver', 'financeiro.gerenciar',
    'nfe.ver', 'nfe.gerenciar',
    'relatorios.ver',
    'equipe.ver', 'equipe.gerenciar',
    'configuracoes.ver', 'configuracoes.gerenciar'
  ]::text[]
$$;

-- Quem tem qualquer uma destas precisa de MFA.
create or replace function private.sensitive_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['equipe.gerenciar', 'configuracoes.gerenciar', 'financeiro.gerenciar']::text[]
$$;

-- "gerenciar" inclui "ver".
create or replace function private.expand_permissions(perms text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct p), '{}'::text[])
  from (
    select unnest(perms) as p
    union
    select replace(unnest(perms), '.gerenciar', '.ver')
  ) s
$$;

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text check (description is null or char_length(description) <= 200),
  permissions text[] not null default '{}'
    check (permissions <@ private.valid_permissions()),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organization_roles is 'Perfis de acesso de cada gráfica, com as permissões liberadas.';
comment on column public.organization_roles.is_admin is 'Perfil Administrador: todas as permissões, criado automaticamente e imutável.';

create unique index organization_roles_name_idx
  on public.organization_roles (organization_id, lower(btrim(name)));
create unique index organization_roles_one_admin_idx
  on public.organization_roles (organization_id) where is_admin;

create trigger organization_roles_set_updated_at
  before update on public.organization_roles
  for each row execute function private.set_updated_at();

create trigger organization_roles_audit
  after insert or update or delete on public.organization_roles
  for each row execute function private.audit_row_change();

-- Perfis iniciais de toda gráfica (editáveis, exceto o Administrador).
create or replace function private.seed_default_roles(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_roles (organization_id, name, description, permissions, is_admin)
  values
    (org, 'Administrador', 'Acesso total à gráfica, equipe, perfis e configurações.',
      private.valid_permissions(), true),
    (org, 'Atendimento', 'Pedidos, clientes, orçamentos e artes.',
      array['pedidos.gerenciar', 'artes.gerenciar', 'cadastros.gerenciar', 'pcp.ver', 'estoque.ver', 'expedicao.ver'], false),
    (org, 'Designer', 'Fila de artes, upload de provas e histórico de versões.',
      array['artes.gerenciar', 'pedidos.ver', 'pcp.ver'], false),
    (org, 'Produção', 'Painel PCP, apontamento de etapas e consumo de insumos.',
      array['pcp.gerenciar', 'estoque.gerenciar', 'pedidos.ver'], false),
    (org, 'Expedição', 'Separação, etiquetas, despacho e rastreio.',
      array['expedicao.gerenciar', 'pedidos.ver', 'pcp.ver'], false),
    (org, 'Financeiro', 'Contas a receber e a pagar, NF-e e relatórios.',
      array['financeiro.gerenciar', 'nfe.gerenciar', 'relatorios.ver', 'pedidos.ver'], false)
  on conflict do nothing;
end;
$$;

revoke all on function private.seed_default_roles(uuid) from public;

create or replace function private.on_organization_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_roles(new.id);
  return new;
end;
$$;

create trigger organizations_seed_roles
  after insert on public.organizations
  for each row execute function private.on_organization_created();

select private.seed_default_roles(id) from public.organizations;

-- -----------------------------------------------------------------------------
-- Vínculos passam a apontar para um perfil da gráfica
-- -----------------------------------------------------------------------------
alter table public.organization_members
  -- "no action" (padrão) é conferido no fim do comando: apagar a gráfica inteira funciona,
  -- mas apagar um perfil que ainda tem pessoas falha.
  add column role_id uuid references public.organization_roles (id);

update public.organization_members m
set role_id = r.id
from public.organization_roles r
where r.organization_id = m.organization_id
  and (
    (m.role = 'admin' and r.is_admin)
    or (m.role = 'atendimento' and r.name = 'Atendimento')
    or (m.role = 'designer' and r.name = 'Designer')
    or (m.role = 'producao' and r.name = 'Produção')
    or (m.role = 'expedicao' and r.name = 'Expedição')
    or (m.role = 'financeiro' and r.name = 'Financeiro')
  );

alter table public.organization_members alter column role_id set not null;
create index organization_members_role_idx on public.organization_members (role_id);

-- -----------------------------------------------------------------------------
-- Funções do RLS baseadas em permissões
-- -----------------------------------------------------------------------------

-- Perfil de quem está logado na gráfica (nulo se não for membro ativo de gráfica ativa).
create or replace function private.member_role_row(org uuid)
returns public.organization_roles
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  join public.organization_roles r on r.id = m.role_id
  where m.organization_id = org
    and m.user_id = (select auth.uid())
    and m.active
    and o.active
$$;

create or replace function private.role_requires_mfa(is_admin boolean, perms text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(is_admin, false) or coalesce(perms && private.sensitive_permissions(), false)
$$;

-- Membro com acesso liberado (perfis que exigem MFA só contam depois do MFA).
create or replace function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.id is null then false
    when private.role_requires_mfa(r.is_admin, r.permissions) then private.is_aal2()
    else true
  end
  from private.member_role_row(org) r
$$;

create or replace function private.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.member_role_row(org)).is_admin, false) and private.is_aal2()
$$;

-- Permissões efetivas de quem está logado na gráfica.
-- O SuperAdmin NÃO ganha nada aqui: ele não lê dados operacionais das gráficas (LGPD);
-- o acesso de plataforma (gráficas, perfis, vínculos) é liberado à parte, política a política.
create or replace function private.actor_permissions(org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_org_admin(org) then private.valid_permissions()
    when not private.is_member(org) then '{}'::text[]
    else private.expand_permissions((private.member_role_row(org)).permissions)
  end
$$;

create or replace function private.has_permission(org uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select perm = any (private.actor_permissions(org))
$$;

revoke all on function private.member_role_row(uuid) from public;
revoke all on function private.actor_permissions(uuid) from public;
revoke all on function private.has_permission(uuid, text) from public;
grant execute on function private.member_role_row(uuid) to authenticated;
grant execute on function private.actor_permissions(uuid) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.role_requires_mfa(boolean, text[]) to authenticated;
grant execute on function private.valid_permissions() to authenticated;
grant execute on function private.sensitive_permissions() to authenticated;
grant execute on function private.expand_permissions(text[]) to authenticated;

-- O modelo antigo (lista fixa de perfis) sai de cena.
drop function if exists private.has_org_role(uuid, public.app_role[]);
drop function if exists private.member_role(uuid);
alter table public.organization_members drop column role;
drop type public.app_role;

-- -----------------------------------------------------------------------------
-- Regras contra escalada de privilégio
-- -----------------------------------------------------------------------------
create or replace function private.guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_actor_role uuid;
begin
  -- Servidor (chave secreta) passa direto. Os perfis iniciais são criados pelo gatilho
  -- de "gráfica criada" (pg_trigger_depth > 1), inclusive o Administrador.
  if (select auth.uid()) is null or (tg_op = 'INSERT' and pg_trigger_depth() > 1) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.is_admin then
      raise exception 'O perfil Administrador não pode ser excluído.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_admin then
      raise exception 'O perfil Administrador não pode ser alterado.' using errcode = '42501';
    end if;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Um perfil não pode mudar de gráfica.' using errcode = '42501';
    end if;
  end if;

  if new.is_admin then
    raise exception 'Só existe um perfil Administrador por gráfica.' using errcode = '42501';
  end if;

  new.permissions := private.expand_permissions(new.permissions);

  -- Ninguém concede o que não tem (o SuperAdmin configura perfis pela plataforma).
  if not private.is_platform_admin()
     and not (new.permissions <@ private.actor_permissions(v_org)) then
    raise exception 'Você não pode liberar permissões que o seu perfil não tem.' using errcode = '42501';
  end if;

  -- Quem não é admin não edita o próprio perfil (evita se dar mais acesso).
  if tg_op = 'UPDATE' and not (private.is_org_admin(v_org) or private.is_platform_admin()) then
    select m.role_id into v_actor_role
    from public.organization_members m
    where m.organization_id = v_org and m.user_id = (select auth.uid());
    if v_actor_role = old.id then
      raise exception 'Você não pode alterar o perfil que você mesmo usa.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger organization_roles_guard
  before insert or update or delete on public.organization_roles
  for each row execute function private.guard_role_change();

create or replace function private.guard_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.organization_roles;
begin
  if v_uid is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'Não é possível mover um vínculo para outra gráfica ou pessoa.' using errcode = '42501';
  end if;

  select * into v_role from public.organization_roles where id = new.role_id;
  if v_role.id is null or v_role.organization_id <> new.organization_id then
    raise exception 'Perfil inválido para esta gráfica.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.role_id is distinct from old.role_id then
    if v_role.is_admin and not (private.is_org_admin(new.organization_id) or private.is_platform_admin()) then
      raise exception 'Só um administrador pode dar o perfil Administrador.' using errcode = '42501';
    end if;
    if not private.is_platform_admin()
       and not (private.expand_permissions(v_role.permissions) <@ private.actor_permissions(new.organization_id)) then
      raise exception 'Você não pode atribuir um perfil com mais permissões que o seu.' using errcode = '42501';
    end if;
  end if;

  -- Evita a gráfica ficar sem admin por engano: ninguém troca o próprio perfil ou se desativa.
  if tg_op = 'UPDATE' and old.user_id = v_uid
     and (new.role_id is distinct from old.role_id or not new.active)
     and not private.is_platform_admin() then
    raise exception 'Você não pode alterar o próprio perfil de acesso nem se desativar.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organization_roles enable row level security;

-- Cada pessoa sempre vê o próprio perfil (necessário para saber se precisa de MFA).
create policy "Membros veem os perfis da gráfica; cada um vê o seu"
  on public.organization_roles for select to authenticated
  using (
    (select private.is_member(organization_id))
    or (select private.is_platform_admin())
    or id in (
      select m.role_id from public.organization_members m
      where m.user_id = (select auth.uid()) and m.active
    )
  );

create policy "Quem gerencia a equipe cria perfis"
  on public.organization_roles for insert to authenticated
  with check ((select private.has_permission(organization_id, 'equipe.gerenciar')));

create policy "Quem gerencia a equipe edita perfis"
  on public.organization_roles for update to authenticated
  using ((select private.has_permission(organization_id, 'equipe.gerenciar')))
  with check ((select private.has_permission(organization_id, 'equipe.gerenciar')));

create policy "Quem gerencia a equipe exclui perfis"
  on public.organization_roles for delete to authenticated
  using ((select private.has_permission(organization_id, 'equipe.gerenciar')));

revoke all on public.organization_roles from anon;

-- Vínculos: agora pela permissão "equipe.gerenciar".
drop policy "Admin da gráfica e plataforma adicionam membros" on public.organization_members;
drop policy "Admin da gráfica e plataforma editam membros" on public.organization_members;

create policy "Quem gerencia a equipe adiciona membros"
  on public.organization_members for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'equipe.gerenciar'))
    or (select private.is_platform_admin())
  );

create policy "Quem gerencia a equipe edita membros"
  on public.organization_members for update to authenticated
  using (
    (select private.has_permission(organization_id, 'equipe.gerenciar'))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_permission(organization_id, 'equipe.gerenciar'))
    or (select private.is_platform_admin())
  );

-- Dados da gráfica: pela permissão "configuracoes.gerenciar".
drop policy "Admin da gráfica e plataforma editam a gráfica" on public.organizations;
create policy "Configurações e plataforma editam a gráfica"
  on public.organizations for update to authenticated
  using (
    (select private.has_permission(id, 'configuracoes.gerenciar'))
    or (select private.is_platform_admin())
  )
  with check (
    (select private.has_permission(id, 'configuracoes.gerenciar'))
    or (select private.is_platform_admin())
  );

-- -----------------------------------------------------------------------------
-- Senha provisória
-- -----------------------------------------------------------------------------
alter table public.profiles add column must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Senha definida por outra pessoa (admin): obriga a criar a própria no próximo login.';

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Chave secreta (servidor) passa direto: ela mantém e-mail, usuário e a senha provisória em sincronia.
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.username is distinct from old.username
     or new.email is distinct from old.email
     or new.must_change_password is distinct from old.must_change_password then
    raise exception 'Usuário, e-mail e senha provisória só podem ser alterados pelo servidor.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

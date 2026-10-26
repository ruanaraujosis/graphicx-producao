-- =============================================================================
-- Backup por gráfica
--   Cópia de todos os dados de UMA gráfica (tabelas com organization_id),
--   gerada pela rotina diária ou pelo SuperAdmin. O arquivo fica num bucket
--   privado sem políticas: só o servidor lê e grava. O SuperAdmin vê só os
--   metadados (data, tamanho, contagem) — não lê dados operacionais.
-- =============================================================================

create table public.platform_backups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  organization_name text not null check (char_length(organization_name) <= 200),
  kind text not null check (kind in ('automatico', 'manual')),
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  storage_path text check (storage_path is null or char_length(storage_path) <= 300),
  size_bytes bigint,
  row_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(row_counts) = 'object'),
  error text check (error is null or char_length(error) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.platform_backups is
  'Backups por gráfica (metadados). O conteúdo fica no bucket privado "backups", acessível só pelo servidor.';

create index platform_backups_org_idx on public.platform_backups (organization_id, created_at desc);

alter table public.platform_backups enable row level security;
create policy "SuperAdmin vê os backups" on public.platform_backups for select to authenticated
  using ((select private.is_platform_admin()));
revoke all on public.platform_backups from anon;
revoke insert, update, delete on public.platform_backups from authenticated;

-- Bucket sem políticas para usuários: ninguém logado lê ou grava, só a chave do servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/gzip'])
on conflict (id) do nothing;

-- Tabelas que entram no backup: todas as do schema public com organization_id.
create or replace function public.backup_tables()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
    and c.column_name = 'organization_id'
    and t.table_type = 'BASE TABLE'
  order by 1
$$;

revoke all on function public.backup_tables() from public, anon, authenticated;
grant execute on function public.backup_tables() to service_role;

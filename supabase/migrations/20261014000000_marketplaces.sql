-- =============================================================================
-- Fase 5 (etapa 1) — Base das integrações com marketplaces
--   Lojas conectadas (tokens no Vault, criptografados), vínculos anúncio ↔
--   variação, fila de tarefas com retentativa e idempotência, registro das
--   chamadas e o "relógio" (pg_cron + pg_net) que aciona o processador da fila.
--   Shopee primeiro; Magalu e TikTok Shop usam a mesma estrutura.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create type public.marketplace as enum ('shopee', 'magalu', 'tiktok');

-- -----------------------------------------------------------------------------
-- Lojas
-- -----------------------------------------------------------------------------
create table public.marketplace_shops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  marketplace public.marketplace not null,
  external_shop_id text not null check (char_length(external_shop_id) between 1 and 40),
  name text check (name is null or char_length(name) <= 160),
  region text check (region is null or char_length(region) <= 10),
  status text not null default 'conectada' check (status in ('conectada', 'expirada', 'desconectada')),
  -- Tokens ficam no Vault; aqui só a referência.
  access_token_secret_id uuid,
  refresh_token_secret_id uuid,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  -- Margem de segurança: fração da disponibilidade enviada como estoque (1 = tudo).
  stock_ratio numeric(4, 3) not null default 0.9 check (stock_ratio between 0.1 and 1),
  chat_message_enabled boolean not null default false,
  chat_template text check (chat_template is null or char_length(chat_template) <= 1000),
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma loja do marketplace pertence a uma gráfica só.
  unique (marketplace, external_shop_id)
);

comment on table public.marketplace_shops is
  'Lojas dos marketplaces conectadas pela gráfica. Tokens OAuth ficam criptografados no Vault.';
comment on column public.marketplace_shops.stock_ratio is
  'Margem de segurança: estoque enviado = disponibilidade × stock_ratio (arredondado para baixo).';

create index marketplace_shops_org_idx on public.marketplace_shops (organization_id, marketplace);

-- -----------------------------------------------------------------------------
-- Vínculos anúncio ↔ variação
-- -----------------------------------------------------------------------------
create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.marketplace_shops (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  external_item_id text not null check (char_length(external_item_id) between 1 and 40),
  -- '' quando o anúncio não tem variações.
  external_model_id text not null default '' check (char_length(external_model_id) <= 40),
  title text check (title is null or char_length(title) <= 300),
  external_sku text check (external_sku is null or char_length(external_sku) <= 100),
  status text not null default 'ativo' check (status in ('ativo', 'inativo', 'excluido')),
  last_stock_sent integer,
  last_price_sent numeric(12, 2),
  last_synced_at timestamptz,
  sync_error text check (sync_error is null or char_length(sync_error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, external_item_id, external_model_id)
);

comment on table public.marketplace_listings is
  'Anúncio (e variação) do marketplace ligado a uma variação do cadastro. Sem variant_id = ainda não vinculado.';

create index marketplace_listings_variant_idx on public.marketplace_listings (variant_id) where variant_id is not null;

-- -----------------------------------------------------------------------------
-- Fila de tarefas
-- -----------------------------------------------------------------------------
create table public.marketplace_jobs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.marketplace_shops (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z]+(\.[a-z_]+)+$'),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 200),
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'feito', 'erro')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.marketplace_jobs is
  'Fila das integrações (importar pedido, enviar estoque/preço…). Retentativa com espera crescente; idempotente por dedupe_key.';

-- Idempotência: só uma tarefa em aberto por (loja, tipo, chave).
create unique index marketplace_jobs_dedupe_idx on public.marketplace_jobs (shop_id, kind, dedupe_key)
  where dedupe_key is not null and status in ('pendente', 'processando');
create index marketplace_jobs_queue_idx on public.marketplace_jobs (run_after) where status = 'pendente';
create index marketplace_jobs_shop_idx on public.marketplace_jobs (shop_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Registro das chamadas (sem dados de comprador: só metadados)
-- -----------------------------------------------------------------------------
create table public.marketplace_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid references public.marketplace_shops (id) on delete cascade,
  direction text not null check (direction in ('saida', 'entrada')),
  endpoint text not null check (char_length(endpoint) <= 200),
  ok boolean not null,
  status_code integer,
  duration_ms integer,
  request_id text check (request_id is null or char_length(request_id) <= 100),
  error text check (error is null or char_length(error) <= 1000),
  created_at timestamptz not null default now()
);

comment on table public.marketplace_logs is 'Chamadas às APIs e avisos recebidos (só metadados, sem dados pessoais). Guardado por 30 dias.';

create index marketplace_logs_shop_idx on public.marketplace_logs (shop_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Pedidos vindos de marketplace
-- -----------------------------------------------------------------------------
alter table public.orders
  add column shop_id uuid references public.marketplace_shops (id) on delete set null,
  add column external_status text check (external_status is null or char_length(external_status) <= 40),
  add column ship_by_at timestamptz,
  add column package_number text check (package_number is null or char_length(package_number) <= 60);

comment on column public.orders.ship_by_at is 'Data/hora limite de postagem informada pelo marketplace.';

-- -----------------------------------------------------------------------------
-- updated_at e auditoria
-- -----------------------------------------------------------------------------
create trigger marketplace_shops_set_updated_at before update on public.marketplace_shops
  for each row execute function private.set_updated_at();
create trigger marketplace_listings_set_updated_at before update on public.marketplace_listings
  for each row execute function private.set_updated_at();
create trigger marketplace_jobs_set_updated_at before update on public.marketplace_jobs
  for each row execute function private.set_updated_at();

create trigger marketplace_shops_audit after insert or update or delete on public.marketplace_shops
  for each row execute function private.audit_row_change();
create trigger marketplace_listings_audit after insert or update or delete on public.marketplace_listings
  for each row execute function private.audit_row_change();

-- Vínculo e variação da mesma gráfica.
create or replace function private.marketplace_listings_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.marketplace_shops s where s.id = new.shop_id and s.organization_id = new.organization_id) then
    raise exception 'Loja de outra gráfica.' using errcode = '42501';
  end if;
  if new.variant_id is not null
     and not exists (select 1 from public.product_variants v where v.id = new.variant_id and v.organization_id = new.organization_id) then
    raise exception 'Variação de outra gráfica.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger marketplace_listings_check before insert or update on public.marketplace_listings
  for each row execute function private.marketplace_listings_check();

-- -----------------------------------------------------------------------------
-- Tokens no Vault (só o servidor, com a chave secreta)
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_save_tokens(
  p_shop uuid,
  p_access text,
  p_refresh text,
  p_access_expires timestamptz,
  p_refresh_expires timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.marketplace_shops;
begin
  select * into s from public.marketplace_shops where id = p_shop for update;
  if s.id is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0002';
  end if;

  if s.access_token_secret_id is null then
    s.access_token_secret_id := vault.create_secret(p_access, 'marketplace_access_' || p_shop::text);
  else
    perform vault.update_secret(s.access_token_secret_id, p_access);
  end if;
  if s.refresh_token_secret_id is null then
    s.refresh_token_secret_id := vault.create_secret(p_refresh, 'marketplace_refresh_' || p_shop::text);
  else
    perform vault.update_secret(s.refresh_token_secret_id, p_refresh);
  end if;

  update public.marketplace_shops
  set access_token_secret_id = s.access_token_secret_id,
      refresh_token_secret_id = s.refresh_token_secret_id,
      access_expires_at = p_access_expires,
      refresh_expires_at = p_refresh_expires,
      status = 'conectada',
      last_error = null
  where id = p_shop;
end;
$$;

create or replace function public.marketplace_get_tokens(p_shop uuid)
returns table (access_token text, refresh_token text, access_expires_at timestamptz, refresh_expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.decrypted_secret, r.decrypted_secret, s.access_expires_at, s.refresh_expires_at
  from public.marketplace_shops s
  left join vault.decrypted_secrets a on a.id = s.access_token_secret_id
  left join vault.decrypted_secrets r on r.id = s.refresh_token_secret_id
  where s.id = p_shop
$$;

-- Desconectar apaga os tokens do Vault.
create or replace function public.marketplace_forget_tokens(p_shop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.marketplace_shops;
begin
  select * into s from public.marketplace_shops where id = p_shop for update;
  if s.id is null then
    return;
  end if;
  delete from vault.secrets where id in (s.access_token_secret_id, s.refresh_token_secret_id);
  update public.marketplace_shops
  set access_token_secret_id = null, refresh_token_secret_id = null,
      access_expires_at = null, refresh_expires_at = null, status = 'desconectada'
  where id = p_shop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fila: enfileirar, pegar e concluir
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_enqueue(
  p_shop uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null,
  p_run_after timestamptz default now()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id bigint;
begin
  select organization_id into v_org from public.marketplace_shops where id = p_shop and status <> 'desconectada';
  if v_org is null then
    return null;
  end if;
  insert into public.marketplace_jobs (organization_id, shop_id, kind, payload, dedupe_key, run_after)
  values (v_org, p_shop, p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe, p_run_after)
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Pega até N tarefas prontas, sem disputar com outro processador.
create or replace function public.marketplace_claim_jobs(p_limit integer default 20)
returns setof public.marketplace_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Tarefas presas (processador caiu no meio) voltam para a fila depois de 10 minutos.
  update public.marketplace_jobs
  set status = 'pendente'
  where status = 'processando' and updated_at < now() - interval '10 minutes';

  return query
  update public.marketplace_jobs j
  set status = 'processando', attempts = j.attempts + 1
  where j.id in (
    select q.id from public.marketplace_jobs q
    where q.status = 'pendente' and q.run_after <= now()
    order by q.run_after, q.id
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Conclui: sucesso, ou nova tentativa com espera crescente (até 6 tentativas).
create or replace function public.marketplace_finish_job(p_job bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.marketplace_jobs;
begin
  select * into j from public.marketplace_jobs where id = p_job for update;
  if j.id is null then
    return;
  end if;
  if p_ok then
    update public.marketplace_jobs
    set status = 'feito', finished_at = now(), last_error = null
    where id = p_job;
  elsif j.attempts >= 6 then
    update public.marketplace_jobs
    set status = 'erro', finished_at = now(), last_error = left(p_error, 2000)
    where id = p_job;
  else
    update public.marketplace_jobs
    set status = 'pendente',
        run_after = now() + make_interval(mins => power(2, j.attempts)::integer),
        last_error = left(p_error, 2000)
    where id = p_job;
  end if;
end;
$$;

revoke all on function public.marketplace_save_tokens(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.marketplace_get_tokens(uuid) from public, anon, authenticated;
revoke all on function public.marketplace_forget_tokens(uuid) from public, anon, authenticated;
revoke all on function public.marketplace_enqueue(uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.marketplace_claim_jobs(integer) from public, anon, authenticated;
revoke all on function public.marketplace_finish_job(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.marketplace_save_tokens(uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.marketplace_get_tokens(uuid) to service_role;
grant execute on function public.marketplace_forget_tokens(uuid) to service_role;
grant execute on function public.marketplace_enqueue(uuid, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.marketplace_claim_jobs(integer) to service_role;
grant execute on function public.marketplace_finish_job(bigint, boolean, text) to service_role;

-- -----------------------------------------------------------------------------
-- Relógio: aciona o processador da fila (rota do app) e as rotinas periódicas.
-- Endereço e segredo ficam no Vault (cadastrados por ambiente, nunca no código):
--   marketplace_worker_url    → https://<app>/api/marketplaces/worker
--   marketplace_worker_secret → mesmo valor de CRON_SECRET na Vercel
-- Sem eles, o relógio não faz nada (ex.: banco local de testes).
-- -----------------------------------------------------------------------------
create or replace function private.marketplace_tick(p_reason text default 'fila')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'marketplace_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'marketplace_worker_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  if p_reason = 'fila'
     and not exists (select 1 from public.marketplace_jobs where status = 'pendente' and run_after <= now()) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('reason', p_reason),
    timeout_milliseconds := 5000
  );
end;
$$;

-- Rotinas: renovar tokens perto de vencer e conferir pedidos (pega o que um aviso perdeu).
create or replace function private.marketplace_schedule_routines()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  for s in select id, access_expires_at from public.marketplace_shops where status = 'conectada' loop
    if s.access_expires_at is not null and s.access_expires_at < now() + interval '30 minutes' then
      perform public.marketplace_enqueue(s.id, 'auth.refresh', '{}'::jsonb, 'refresh');
    end if;
    perform public.marketplace_enqueue(s.id, 'orders.reconcile', '{}'::jsonb, 'reconcile');
  end loop;
  -- Faxina: registros com mais de 30 dias e tarefas concluídas com mais de 7.
  delete from public.marketplace_logs where created_at < now() - interval '30 days';
  delete from public.marketplace_jobs where status = 'feito' and finished_at < now() - interval '7 days';
end;
$$;

revoke all on function private.marketplace_tick(text) from public;
revoke all on function private.marketplace_schedule_routines() from public;

select cron.schedule('marketplace-fila', '* * * * *', $$select private.marketplace_tick('fila')$$);
select cron.schedule('marketplace-rotinas', '*/15 * * * *',
  $$select private.marketplace_schedule_routines(); select private.marketplace_tick('rotinas')$$);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.marketplace_shops enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_jobs enable row level security;
alter table public.marketplace_logs enable row level security;

create policy "Ler lojas conectadas" on public.marketplace_shops for select to authenticated
  using ((select private.has_any_permission(organization_id, 'configuracoes.ver', 'cadastros.ver', 'pedidos.ver')));
create policy "Conectar lojas" on public.marketplace_shops for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'configuracoes.gerenciar'))
    and created_by = (select auth.uid())
  );
create policy "Configurar lojas" on public.marketplace_shops for update to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.gerenciar')))
  with check ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));

create policy "Ler anúncios vinculados" on public.marketplace_listings for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'configuracoes.ver')));
create policy "Vincular anúncios" on public.marketplace_listings for update to authenticated
  using ((select private.has_permission(organization_id, 'cadastros.gerenciar')))
  with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));

create policy "Ler fila das integrações" on public.marketplace_jobs for select to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.ver')));
create policy "Ler registro das integrações" on public.marketplace_logs for select to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.ver')));

revoke all on public.marketplace_shops, public.marketplace_listings, public.marketplace_jobs,
  public.marketplace_logs from anon;
revoke delete on public.marketplace_shops, public.marketplace_listings from authenticated;
revoke insert, update, delete on public.marketplace_jobs, public.marketplace_logs from authenticated;
revoke insert on public.marketplace_listings from authenticated;

-- A equipe só ajusta nome, margem e mensagem; tokens e status mudam pelo servidor.
revoke update on public.marketplace_shops from authenticated;
grant update (name, stock_ratio, chat_message_enabled, chat_template) on public.marketplace_shops to authenticated;

-- No anúncio, a equipe só escolhe a variação vinculada.
revoke update on public.marketplace_listings from authenticated;
grant update (variant_id) on public.marketplace_listings to authenticated;

-- shop_id/external_status/ship_by_at/package_number do pedido: só o servidor grava.

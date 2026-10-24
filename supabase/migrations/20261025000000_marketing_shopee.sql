-- =============================================================================
-- Fase 7 — Marketing Shopee
--   Impulsionamento automático (lista de prioridade por loja, 5 a cada 4 h) e
--   respostas às avaliações por modelos prontos por faixa de estrelas: 4–5★
--   respondidas sozinhas, 1–3★ esperam revisão. Módulo de permissão "marketing".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissões: novo módulo "marketing" (manter igual a src/lib/auth/permissions.ts)
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
    'marketing.ver', 'marketing.gerenciar',
    'relatorios.ver',
    'equipe.ver', 'equipe.gerenciar',
    'configuracoes.ver', 'configuracoes.gerenciar'
  ]::text[]
$$;

-- -----------------------------------------------------------------------------
-- Configuração por loja
-- -----------------------------------------------------------------------------
alter table public.marketplace_shops
  add column boost_enabled boolean not null default false,
  add column last_boost_at timestamptz,
  add column review_auto_reply boolean not null default true,
  add column review_signature text check (review_signature is null or char_length(review_signature) <= 60),
  add column reviews_synced_at timestamptz;

comment on column public.marketplace_shops.review_auto_reply is
  'Responde sozinho as avaliações de 4 e 5 estrelas; as de 1 a 3 sempre esperam revisão.';

create policy "Marketing vê as lojas" on public.marketplace_shops for select to authenticated
  using ((select private.has_permission(organization_id, 'marketing.ver')));

-- Opções de marketing da loja: só estas três colunas, para quem gerencia marketing
-- (sem abrir margem de estoque, preços ou chat para esse perfil).
create or replace function public.marketing_shop_settings(
  p_shop uuid,
  p_boost_enabled boolean,
  p_review_auto_reply boolean,
  p_review_signature text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.marketplace_shops where id = p_shop;
  if v_org is null or not (select private.has_permission(v_org, 'marketing.gerenciar')) then
    raise exception 'Sem permissão para configurar o marketing desta loja.' using errcode = '42501';
  end if;
  update public.marketplace_shops
  set boost_enabled = p_boost_enabled,
      review_auto_reply = p_review_auto_reply,
      review_signature = left(nullif(btrim(coalesce(p_review_signature, '')), ''), 60)
  where id = p_shop;
end;
$$;

revoke all on function public.marketing_shop_settings(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.marketing_shop_settings(uuid, boolean, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Lista de prioridade do impulsionamento (por anúncio, não por variação)
-- -----------------------------------------------------------------------------
create table public.marketplace_boost_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.marketplace_shops (id) on delete cascade,
  external_item_id text not null check (char_length(external_item_id) between 1 and 40),
  title text check (title is null or char_length(title) <= 300),
  position integer not null default 0,
  active boolean not null default true,
  last_boosted_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, external_item_id)
);

comment on table public.marketplace_boost_items is
  'Anúncios na fila de impulsionamento da loja, em ordem de prioridade (position).';

create index marketplace_boost_items_order_idx on public.marketplace_boost_items (shop_id, position);

-- -----------------------------------------------------------------------------
-- Modelos de resposta por faixa de estrelas (da gráfica, valem para todas as lojas)
-- -----------------------------------------------------------------------------
create table public.marketplace_reply_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  min_stars smallint not null check (min_stars between 1 and 5),
  max_stars smallint not null check (max_stars between 1 and 5),
  body text not null check (char_length(btrim(body)) between 5 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_stars <= max_stars)
);

comment on table public.marketplace_reply_templates is
  'Respostas prontas por faixa de estrelas ({comprador}, {produto}, {loja}). Sem modelos, valem os padrões do GraphicX.';

create index marketplace_reply_templates_org_idx on public.marketplace_reply_templates (organization_id, min_stars);

-- -----------------------------------------------------------------------------
-- Avaliações dos compradores
-- -----------------------------------------------------------------------------
create table public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.marketplace_shops (id) on delete cascade,
  external_comment_id text not null check (char_length(external_comment_id) between 1 and 40),
  external_item_id text check (external_item_id is null or char_length(external_item_id) <= 40),
  item_title text check (item_title is null or char_length(item_title) <= 300),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  buyer_name text check (buyer_name is null or char_length(buyer_name) <= 120),
  commented_at timestamptz,
  -- Resposta: sugestão (pendente) ou a que foi enviada.
  reply_text text check (reply_text is null or char_length(reply_text) <= 500),
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'respondida', 'ignorada', 'erro')),
  auto boolean not null default false,
  replied_at timestamptz,
  replied_by uuid references auth.users (id) on delete set null,
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, external_comment_id)
);

comment on table public.marketplace_reviews is
  'Avaliações da loja no marketplace e a resposta (automática para 4–5★, revisada para 1–3★).';

create index marketplace_reviews_inbox_idx on public.marketplace_reviews (organization_id, status, commented_at desc);

-- -----------------------------------------------------------------------------
-- updated_at, auditoria e mesma gráfica
-- -----------------------------------------------------------------------------
create trigger marketplace_boost_items_set_updated_at before update on public.marketplace_boost_items
  for each row execute function private.set_updated_at();
create trigger marketplace_reply_templates_set_updated_at before update on public.marketplace_reply_templates
  for each row execute function private.set_updated_at();
create trigger marketplace_reviews_set_updated_at before update on public.marketplace_reviews
  for each row execute function private.set_updated_at();
create trigger marketplace_boost_items_audit after insert or update or delete on public.marketplace_boost_items
  for each row execute function private.audit_row_change();
create trigger marketplace_reply_templates_audit after insert or update or delete on public.marketplace_reply_templates
  for each row execute function private.audit_row_change();

create or replace function private.marketing_shop_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.marketplace_shops s where s.id = new.shop_id and s.organization_id = new.organization_id) then
    raise exception 'Loja de outra gráfica.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger marketplace_boost_items_check before insert or update on public.marketplace_boost_items
  for each row execute function private.marketing_shop_check();
create trigger marketplace_reviews_check before insert or update on public.marketplace_reviews
  for each row execute function private.marketing_shop_check();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.marketplace_boost_items enable row level security;
alter table public.marketplace_reply_templates enable row level security;
alter table public.marketplace_reviews enable row level security;

create policy "Ler impulsionamento" on public.marketplace_boost_items for select to authenticated
  using ((select private.has_permission(organization_id, 'marketing.ver')));
create policy "Montar impulsionamento" on public.marketplace_boost_items for insert to authenticated
  with check ((select private.has_permission(organization_id, 'marketing.gerenciar')));
create policy "Ordenar impulsionamento" on public.marketplace_boost_items for update to authenticated
  using ((select private.has_permission(organization_id, 'marketing.gerenciar')))
  with check ((select private.has_permission(organization_id, 'marketing.gerenciar')));
create policy "Tirar do impulsionamento" on public.marketplace_boost_items for delete to authenticated
  using ((select private.has_permission(organization_id, 'marketing.gerenciar')));

create policy "Ler modelos de resposta" on public.marketplace_reply_templates for select to authenticated
  using ((select private.has_permission(organization_id, 'marketing.ver')));
create policy "Criar modelos de resposta" on public.marketplace_reply_templates for insert to authenticated
  with check ((select private.has_permission(organization_id, 'marketing.gerenciar')));
create policy "Editar modelos de resposta" on public.marketplace_reply_templates for update to authenticated
  using ((select private.has_permission(organization_id, 'marketing.gerenciar')))
  with check ((select private.has_permission(organization_id, 'marketing.gerenciar')));
create policy "Excluir modelos de resposta" on public.marketplace_reply_templates for delete to authenticated
  using ((select private.has_permission(organization_id, 'marketing.gerenciar')));

create policy "Ler avaliações" on public.marketplace_reviews for select to authenticated
  using ((select private.has_permission(organization_id, 'marketing.ver')));
create policy "Revisar avaliações" on public.marketplace_reviews for update to authenticated
  using ((select private.has_permission(organization_id, 'marketing.gerenciar')))
  with check ((select private.has_permission(organization_id, 'marketing.gerenciar')));

revoke all on public.marketplace_boost_items, public.marketplace_reply_templates, public.marketplace_reviews from anon;
-- Avaliações chegam pelo servidor; a equipe só edita a resposta e ignora.
revoke insert, delete on public.marketplace_reviews from authenticated;
revoke update on public.marketplace_reviews from authenticated;
grant update (reply_text, status) on public.marketplace_reviews to authenticated;
-- Na lista de impulsionamento, a equipe não mexe no histórico.
revoke update on public.marketplace_boost_items from authenticated;
grant update (position, active) on public.marketplace_boost_items to authenticated;

-- -----------------------------------------------------------------------------
-- Rotinas: impulsionar a cada 4 h e trazer avaliações a cada hora
-- (mesma função da etapa 3 + as duas tarefas novas)
-- -----------------------------------------------------------------------------
create or replace function private.marketplace_schedule_routines()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  for s in
    select id, access_expires_at, boost_enabled, last_boost_at, reviews_synced_at
    from public.marketplace_shops where status = 'conectada'
  loop
    if s.access_expires_at is not null and s.access_expires_at < now() + interval '30 minutes' then
      perform public.marketplace_enqueue(s.id, 'auth.refresh', '{}'::jsonb, 'refresh');
    end if;
    perform public.marketplace_enqueue(s.id, 'orders.reconcile', '{}'::jsonb, 'reconcile');
    perform public.marketplace_enqueue(s.id, 'stock.push_all', '{}'::jsonb, 'stock.push_all');
    perform public.marketplace_enqueue(s.id, 'price.push_all', '{}'::jsonb, 'price.push_all');
    if not exists (
      select 1 from public.marketplace_jobs j
      where j.shop_id = s.id and j.kind = 'listings.import' and j.created_at > now() - interval '1 day'
    ) then
      perform public.marketplace_enqueue(s.id, 'listings.import', '{}'::jsonb, 'listings.import');
    end if;
    -- Impulsionamento: a Shopee mantém o impulso por 4 h.
    if s.boost_enabled and (s.last_boost_at is null or s.last_boost_at < now() - interval '4 hours') then
      perform public.marketplace_enqueue(s.id, 'boost.run', '{}'::jsonb, 'boost.run');
    end if;
    -- Avaliações novas a cada hora.
    if s.reviews_synced_at is null or s.reviews_synced_at < now() - interval '55 minutes' then
      perform public.marketplace_enqueue(s.id, 'reviews.import', '{}'::jsonb, 'reviews.import');
    end if;
  end loop;
  delete from public.marketplace_logs where created_at < now() - interval '30 days';
  delete from public.marketplace_jobs where status = 'feito' and finished_at < now() - interval '7 days';
end;
$$;

revoke all on function private.marketplace_schedule_routines() from public;

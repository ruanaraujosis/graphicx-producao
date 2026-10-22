-- =============================================================================
-- Fase 5 (etapa 3) — Anúncios, estoque e preço
--   Importação dos anúncios da loja com vínculo automático pelo SKU, cálculo do
--   que enviar (estoque com margem de segurança, preço do canal Shopee, prazo de
--   produção) e aviso à fila quando estoque, ficha técnica ou preço mudam.
-- =============================================================================

alter table public.marketplace_shops
  add column price_sync_enabled boolean not null default false;

comment on column public.marketplace_shops.price_sync_enabled is
  'Envia o preço do canal Shopee (base + ajuste ou preço manual) aos anúncios vinculados. Desligado até a gráfica conferir os preços.';

grant update (price_sync_enabled) on public.marketplace_shops to authenticated;

alter table public.marketplace_listings
  add column external_price numeric(12, 2),
  add column external_stock integer,
  add column last_days_sent integer;

comment on column public.marketplace_listings.external_price is 'Preço atual no marketplace (última importação).';
comment on column public.marketplace_listings.external_stock is 'Estoque atual no marketplace (última importação).';

-- -----------------------------------------------------------------------------
-- Importação: grava os anúncios e vincula pelo SKU os que ainda não têm variação.
-- p_items: [{external_item_id, external_model_id, title, external_sku, status,
--            external_price, external_stock}]
-- p_complete: a lista é a loja inteira (o que não veio passa a "excluido").
-- Retorna quantos anúncios ficaram vinculados.
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_upsert_listings(p_shop uuid, p_items jsonb, p_complete boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.marketplace_shops;
  v_seen uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
begin
  select * into s from public.marketplace_shops where id = p_shop;
  if s.id is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Lista de anúncios inválida.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.marketplace_listings as l
      (organization_id, shop_id, external_item_id, external_model_id, title, external_sku, status,
       external_price, external_stock, last_synced_at)
    values
      (s.organization_id, s.id, v_item ->> 'external_item_id', coalesce(v_item ->> 'external_model_id', ''),
       left(v_item ->> 'title', 300), left(nullif(btrim(coalesce(v_item ->> 'external_sku', '')), ''), 100),
       coalesce(v_item ->> 'status', 'ativo'),
       nullif(v_item ->> 'external_price', '')::numeric, nullif(v_item ->> 'external_stock', '')::integer, now())
    on conflict (shop_id, external_item_id, external_model_id) do update
    set title = excluded.title,
        external_sku = excluded.external_sku,
        status = excluded.status,
        external_price = excluded.external_price,
        external_stock = excluded.external_stock,
        last_synced_at = now()
    returning l.id into v_id;
    v_seen := v_seen || v_id;
  end loop;

  -- Vínculo automático: SKU do anúncio igual ao SKU de uma variação (sem diferenciar maiúsculas).
  update public.marketplace_listings l
  set variant_id = v.id
  from public.product_variants v
  where l.id = any (v_seen)
    and l.variant_id is null
    and l.external_sku is not null
    and v.organization_id = s.organization_id
    and upper(v.sku) = upper(l.external_sku);

  if p_complete then
    update public.marketplace_listings
    set status = 'excluido'
    where shop_id = s.id and status <> 'excluido' and not (id = any (v_seen));
  end if;

  return (select count(*) from public.marketplace_listings
          where shop_id = s.id and variant_id is not null and status <> 'excluido');
end;
$$;

-- -----------------------------------------------------------------------------
-- O que enviar a cada anúncio vinculado.
--   stock: disponibilidade × margem da loja (para baixo); nulo quando não dá para
--          calcular (produto sob encomenda sem ficha técnica) — nesse caso nada é enviado.
--   price: preço do canal Shopee.
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_listing_targets(p_shop uuid)
returns table (
  listing_id uuid,
  external_item_id text,
  external_model_id text,
  stock integer,
  price numeric,
  production_days integer,
  last_stock_sent integer,
  last_price_sent numeric,
  last_days_sent integer,
  skip_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.external_item_id,
    l.external_model_id,
    case
      when not (v.active and p.active) then 0
      when p.fulfillment = 'sob_encomenda' and va.bom_items = 0 then null
      else floor(va.available_units * s.stock_ratio)::integer
    end,
    public.variant_price(v.id, 'shopee'),
    p.production_days,
    l.last_stock_sent,
    l.last_price_sent,
    l.last_days_sent,
    case
      when p.fulfillment = 'sob_encomenda' and va.bom_items = 0 and v.active and p.active
        then 'Produto sob encomenda sem ficha técnica: cadastre os insumos para controlar o estoque.'
    end
  from public.marketplace_listings l
  join public.marketplace_shops s on s.id = l.shop_id
  join public.product_variants v on v.id = l.variant_id
  join public.products p on p.id = v.product_id
  join public.variant_availability va on va.variant_id = v.id
  where l.shop_id = p_shop and l.status <> 'excluido'
$$;

revoke all on function public.marketplace_upsert_listings(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.marketplace_listing_targets(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_upsert_listings(uuid, jsonb, boolean) to service_role;
grant execute on function public.marketplace_listing_targets(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Mudou estoque, ficha técnica, produto, preço ou vínculo: avisa a fila das lojas
-- conectadas da gráfica. A chave de deduplicação junta várias mudanças seguidas
-- numa tarefa só (que roda 1 minuto depois e envia só o que mudou).
-- -----------------------------------------------------------------------------
create or replace function private.marketplace_notify_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce((to_jsonb(new) ->> 'organization_id')::uuid, (to_jsonb(old) ->> 'organization_id')::uuid);
  v_shop uuid;
  v_kind text;
begin
  for v_shop in
    select id from public.marketplace_shops where organization_id = v_org and status = 'conectada'
  loop
    foreach v_kind in array tg_argv loop
      perform public.marketplace_enqueue(v_shop, v_kind, '{}'::jsonb, v_kind, now() + interval '1 minute');
    end loop;
  end loop;
  return null;
end;
$$;

create trigger marketplace_stock_balances after insert or update on public.stock_balances
  for each row execute function private.marketplace_notify_change('stock.push_all');
create trigger marketplace_bom_items after insert or update or delete on public.bom_items
  for each row execute function private.marketplace_notify_change('stock.push_all');
create trigger marketplace_products after update of fulfillment, active, production_days on public.products
  for each row execute function private.marketplace_notify_change('stock.push_all');
create trigger marketplace_variants after update of base_price, active on public.product_variants
  for each row execute function private.marketplace_notify_change('stock.push_all', 'price.push_all');
create trigger marketplace_channel_rules after insert or update or delete on public.channel_price_rules
  for each row execute function private.marketplace_notify_change('price.push_all');
create trigger marketplace_channel_prices after insert or update or delete on public.variant_channel_prices
  for each row execute function private.marketplace_notify_change('price.push_all');
create trigger marketplace_listings_link after update of variant_id on public.marketplace_listings
  for each row when (new.variant_id is not null and new.variant_id is distinct from old.variant_id)
  execute function private.marketplace_notify_change('stock.push_all', 'price.push_all');

-- -----------------------------------------------------------------------------
-- Rotinas: também confere estoque/preço a cada 15 min (cobre uma mudança que
-- chegou enquanto a tarefa anterior rodava) e reimporta os anúncios 1× ao dia.
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
  for s in select id, access_expires_at from public.marketplace_shops where status = 'conectada' loop
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
  end loop;
  delete from public.marketplace_logs where created_at < now() - interval '30 days';
  delete from public.marketplace_jobs where status = 'feito' and finished_at < now() - interval '7 days';
end;
$$;

revoke all on function private.marketplace_schedule_routines() from public;

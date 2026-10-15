-- =============================================================================
-- Fase 5 (etapa 4) — Publicar anúncios novos na Shopee a partir do cadastro
--   Categorias da Shopee (dado de referência, igual para todas as gráficas),
--   rascunho da publicação por loja + produto (categoria, atributos, fretes) e
--   o pacote que o servidor monta para publicar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorias do marketplace (referência pública da Shopee, sem dado de gráfica)
-- -----------------------------------------------------------------------------
create table public.marketplace_categories (
  marketplace public.marketplace not null,
  category_id bigint not null,
  parent_id bigint,
  name text not null check (char_length(name) <= 200),
  path text not null check (char_length(path) <= 1000),
  has_children boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (marketplace, category_id)
);

comment on table public.marketplace_categories is
  'Árvore de categorias do marketplace (dado público, igual para todas as gráficas). Atualizada pelo servidor.';

create index marketplace_categories_search_idx on public.marketplace_categories (marketplace, lower(path))
  where not has_children;

alter table public.marketplace_categories enable row level security;
create policy "Ler categorias do marketplace" on public.marketplace_categories for select to authenticated
  using (true);
revoke all on public.marketplace_categories from anon;
revoke insert, update, delete on public.marketplace_categories from authenticated;

-- -----------------------------------------------------------------------------
-- Publicações (rascunho → fila → publicado/erro)
-- -----------------------------------------------------------------------------
create table public.marketplace_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.marketplace_shops (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 10 and 120),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  category_id bigint,
  category_path text check (category_path is null or char_length(category_path) <= 1000),
  -- [{attribute_id, values: [{value_id, original_value_name, value_unit}]}]
  attributes jsonb not null default '[]'::jsonb check (jsonb_typeof(attributes) = 'array'),
  -- ids dos canais de frete habilitados
  logistics jsonb not null default '[]'::jsonb check (jsonb_typeof(logistics) = 'array'),
  item_status text not null default 'NORMAL' check (item_status in ('NORMAL', 'UNLIST')),
  status text not null default 'rascunho' check (status in ('rascunho', 'na_fila', 'publicado', 'erro')),
  external_item_id text check (external_item_id is null or char_length(external_item_id) <= 40),
  error text check (error is null or char_length(error) <= 1000),
  published_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, product_id)
);

comment on table public.marketplace_publications is
  'Anúncio novo montado no GraphicX a partir do cadastro. A equipe edita o rascunho; o servidor publica.';

create trigger marketplace_publications_set_updated_at before update on public.marketplace_publications
  for each row execute function private.set_updated_at();
create trigger marketplace_publications_audit after insert or update or delete on public.marketplace_publications
  for each row execute function private.audit_row_change();

-- Loja e produto da mesma gráfica.
create or replace function private.marketplace_publications_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.marketplace_shops s where s.id = new.shop_id and s.organization_id = new.organization_id) then
    raise exception 'Loja de outra gráfica.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.products p where p.id = new.product_id and p.organization_id = new.organization_id) then
    raise exception 'Produto de outra gráfica.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger marketplace_publications_check before insert or update on public.marketplace_publications
  for each row execute function private.marketplace_publications_check();

alter table public.marketplace_publications enable row level security;
create policy "Ler publicações" on public.marketplace_publications for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'configuracoes.ver')));
create policy "Criar publicações" on public.marketplace_publications for insert to authenticated
  with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')) and status = 'rascunho');
create policy "Editar publicações" on public.marketplace_publications for update to authenticated
  using ((select private.has_permission(organization_id, 'cadastros.gerenciar')))
  with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));

revoke all on public.marketplace_publications from anon;
revoke delete on public.marketplace_publications from authenticated;
-- A equipe edita o rascunho; status, item publicado e erro mudam só pelo servidor.
revoke update on public.marketplace_publications from authenticated;
grant update (title, description, category_id, category_path, attributes, logistics, item_status)
  on public.marketplace_publications to authenticated;

-- -----------------------------------------------------------------------------
-- Pacote para publicar (só o servidor): produto, fotos e variações ativas com
-- preço do canal Shopee, estoque com a margem da loja (nulo = não calculável)
-- e medidas.
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_publication_payload(p_publication uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'publication', to_jsonb(pub),
    'product', jsonb_build_object('name', p.name, 'production_days', p.production_days, 'active', p.active),
    'images', coalesce((
      select jsonb_agg(i.storage_path order by i.position, i.created_at)
      from public.product_images i where i.product_id = p.id
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variant_id', v.id,
        'sku', v.sku,
        'name', v.name,
        'price', public.variant_price(v.id, 'shopee'),
        'stock', case
          when p.fulfillment = 'sob_encomenda' and va.bom_items = 0 then null
          else floor(va.available_units * s.stock_ratio)::integer
        end,
        'weight_g', v.weight_g,
        'length_cm', v.length_cm,
        'width_cm', v.width_cm,
        'height_cm', v.height_cm
      ) order by v.sku)
      from public.product_variants v
      join public.variant_availability va on va.variant_id = v.id
      where v.product_id = p.id and v.active
    ), '[]'::jsonb)
  )
  from public.marketplace_publications pub
  join public.products p on p.id = pub.product_id
  join public.marketplace_shops s on s.id = pub.shop_id
  where pub.id = p_publication
$$;

revoke all on function public.marketplace_publication_payload(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_publication_payload(uuid) to service_role;

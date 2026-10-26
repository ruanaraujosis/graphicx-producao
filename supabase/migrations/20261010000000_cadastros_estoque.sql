-- =============================================================================
-- Fase 2 — Cadastros + Estoque
--   Cadastros: clientes, fornecedores, categorias, produtos, variações, preços por
--   canal, fotos, insumos, ficha técnica e formas de pagamento.
--   Estoque: movimentações imutáveis, saldos mantidos por gatilho, custo médio
--   ponderado, disponibilidade calculada pela ficha técnica e sugestão de compra.
-- Tudo isolado por gráfica (organization_id) e protegido por permissão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.sales_channel as enum ('balcao', 'shopee', 'magalu', 'tiktok', 'whatsapp');
create type public.person_type as enum ('pf', 'pj');
create type public.fulfillment_mode as enum ('sob_encomenda', 'pronta_entrega');
create type public.stock_movement_type as enum (
  'entrada', 'saida', 'ajuste', 'perda', 'consumo', 'reserva', 'liberacao'
);

comment on type public.stock_movement_type is
  'entrada/saida/perda/consumo mexem no saldo; ajuste é com sinal; reserva/liberacao mexem no reservado.';

-- Lê com qualquer uma das permissões.
create or replace function private.has_any_permission(org uuid, variadic perms text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.actor_permissions(org) && perms
$$;

revoke all on function private.has_any_permission(uuid, text[]) from public;
grant execute on function private.has_any_permission(uuid, text[]) to authenticated;

-- Endereço brasileiro (reutilizado por clientes e fornecedores) é validado por estas regras.
-- CEP: 8 dígitos; UF: 2 letras maiúsculas.

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  person_type public.person_type not null default 'pf',
  name text not null check (char_length(btrim(name)) between 2 and 160),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  document text check (
    document is null
    or (document ~ '^[0-9]{11}$' and person_type = 'pf')
    or (document ~ '^[0-9]{14}$' and person_type = 'pj')
  ),
  email text check (email is null or email like '%_@_%'),
  phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  origin public.sales_channel not null default 'balcao',
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  street text,
  number text,
  complement text,
  district text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  notes text check (notes is null or char_length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is 'Clientes da gráfica (PF/PJ). Dados pessoais: acesso restrito (LGPD).';

create unique index customers_document_idx on public.customers (organization_id, document)
  where document is not null;
create index customers_name_idx on public.customers (organization_id, lower(name));

-- -----------------------------------------------------------------------------
-- Fornecedores
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  legal_name text check (legal_name is null or char_length(legal_name) <= 200),
  document text check (document is null or document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  contact_name text,
  email text check (email is null or email like '%_@_%'),
  phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  street text,
  number text,
  complement text,
  district text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  notes text check (notes is null or char_length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_name_idx on public.suppliers (organization_id, lower(name));

-- -----------------------------------------------------------------------------
-- Categorias e produtos
-- -----------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_categories_name_idx
  on public.product_categories (organization_id, lower(btrim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 5000),
  fulfillment public.fulfillment_mode not null default 'sob_encomenda',
  production_days integer not null default 1 check (production_days between 0 and 90),
  ncm text check (ncm is null or ncm ~ '^[0-9]{8}$'),
  cest text check (cest is null or cest ~ '^[0-9]{7}$'),
  cfop text check (cfop is null or cfop ~ '^[0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.products.production_days is 'Prazo de produção em dias úteis; vira o days_to_ship da Shopee.';

create index products_name_idx on public.products (organization_id, lower(name));
create index products_category_idx on public.products (category_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null check (sku ~ '^[A-Za-z0-9._-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  base_price numeric(12, 2) not null default 0 check (base_price >= 0),
  weight_g integer check (weight_g is null or weight_g >= 0),
  length_cm numeric(8, 2) check (length_cm is null or length_cm >= 0),
  width_cm numeric(8, 2) check (width_cm is null or width_cm >= 0),
  height_cm numeric(8, 2) check (height_cm is null or height_cm >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.product_variants.attributes is 'Tamanho, espessura, cor, acabamento: {"tamanho": "10x15", ...}';

create unique index product_variants_sku_idx on public.product_variants (organization_id, upper(sku));
create index product_variants_product_idx on public.product_variants (product_id);

-- Fotos ficam no Storage (bucket privado "produtos", pasta = id da gráfica).
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, position);

-- -----------------------------------------------------------------------------
-- Preços: base da variação + ajuste % por canal + preço manual opcional
-- -----------------------------------------------------------------------------
create table public.channel_price_rules (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel public.sales_channel not null,
  adjustment_pct numeric(6, 2) not null default 0 check (adjustment_pct between -90 and 500),
  updated_at timestamptz not null default now(),
  primary key (organization_id, channel)
);

comment on table public.channel_price_rules is 'Ajuste % sobre o preço base em cada canal (ex.: Shopee +20%). Sem linha = 0%.';

create table public.variant_channel_prices (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  channel public.sales_channel not null,
  price numeric(12, 2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, channel)
);

comment on table public.variant_channel_prices is 'Preço manual de um canal, que substitui a regra base + ajuste.';

-- Mesma regra de src/lib/catalog/pricing.ts (há teste).
create or replace function public.variant_price(p_variant uuid, p_channel public.sales_channel)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select vcp.price from public.variant_channel_prices vcp
      where vcp.variant_id = v.id and vcp.channel = p_channel),
    round(v.base_price * (1 + coalesce(r.adjustment_pct, 0) / 100), 2)
  )
  from public.product_variants v
  left join public.channel_price_rules r
    on r.organization_id = v.organization_id and r.channel = p_channel
  where v.id = p_variant
$$;

-- -----------------------------------------------------------------------------
-- Insumos e ficha técnica
-- -----------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  sku text check (sku is null or sku ~ '^[A-Za-z0-9._-]{2,40}$'),
  unit text not null check (unit in ('un', 'folha', 'm', 'm2', 'cm', 'kg', 'g', 'l', 'ml', 'rolo', 'par', 'cx')),
  avg_cost numeric(14, 4) not null default 0 check (avg_cost >= 0),
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.materials.avg_cost is 'Custo médio ponderado por unidade, recalculado a cada entrada.';

create unique index materials_name_idx on public.materials (organization_id, lower(btrim(name)));
create unique index materials_sku_idx on public.materials (organization_id, upper(sku)) where sku is not null;

create table public.bom_items (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),
  waste_pct numeric(5, 2) not null default 0 check (waste_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (variant_id, material_id)
);

comment on table public.bom_items is 'Ficha técnica: quanto de cada insumo uma unidade da variação consome (+% de perda).';

create index bom_items_material_idx on public.bom_items (material_id);

-- -----------------------------------------------------------------------------
-- Formas de pagamento
-- -----------------------------------------------------------------------------
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'marketplace', 'outro')),
  fee_pct numeric(6, 3) not null default 0 check (fee_pct between 0 and 100),
  settlement_days integer not null default 0 check (settlement_days between 0 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_methods_name_idx on public.payment_methods (organization_id, lower(btrim(name)));

-- -----------------------------------------------------------------------------
-- Estoque: saldos e movimentações
-- -----------------------------------------------------------------------------
create table public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  material_id uuid references public.materials (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  on_hand numeric(14, 3) not null default 0,
  reserved numeric(14, 3) not null default 0,
  updated_at timestamptz not null default now(),
  check ((material_id is null) <> (variant_id is null))
);

comment on table public.stock_balances is 'Saldo atual por insumo ou variação. Mantido só pelo gatilho das movimentações.';

create unique index stock_balances_material_idx on public.stock_balances (material_id) where material_id is not null;
create unique index stock_balances_variant_idx on public.stock_balances (variant_id) where variant_id is not null;

create table public.stock_movements (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  material_id uuid references public.materials (id) on delete restrict,
  variant_id uuid references public.product_variants (id) on delete restrict,
  type public.stock_movement_type not null,
  quantity numeric(14, 3) not null check (quantity <> 0),
  unit_cost numeric(14, 4) check (unit_cost is null or unit_cost >= 0),
  reason text check (reason is null or char_length(reason) <= 500),
  reference text check (reference is null or char_length(reference) <= 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((material_id is null) <> (variant_id is null)),
  check (type = 'ajuste' or quantity > 0),
  check (unit_cost is null or (type = 'entrada' and material_id is not null))
);

comment on table public.stock_movements is 'Histórico imutável do estoque. Correções são feitas com novo lançamento de ajuste.';

create index stock_movements_material_idx on public.stock_movements (material_id, created_at desc);
create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_org_idx on public.stock_movements (organization_id, created_at desc);

-- Aplica a movimentação no saldo e, nas entradas de insumo, recalcula o custo médio.
create or replace function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.stock_balances;
  v_on_hand_delta numeric := 0;
  v_reserved_delta numeric := 0;
  v_available_before numeric;
  v_avg numeric;
begin
  -- O item precisa ser da mesma gráfica da movimentação.
  if new.material_id is not null
     and not exists (select 1 from public.materials m where m.id = new.material_id and m.organization_id = new.organization_id) then
    raise exception 'Insumo de outra gráfica.' using errcode = '42501';
  end if;
  if new.variant_id is not null
     and not exists (select 1 from public.product_variants v where v.id = new.variant_id and v.organization_id = new.organization_id) then
    raise exception 'Variação de outra gráfica.' using errcode = '42501';
  end if;

  case new.type
    when 'entrada' then v_on_hand_delta := new.quantity;
    when 'ajuste' then v_on_hand_delta := new.quantity;
    when 'saida', 'perda', 'consumo' then v_on_hand_delta := -new.quantity;
    when 'reserva' then v_reserved_delta := new.quantity;
    when 'liberacao' then v_reserved_delta := -new.quantity;
  end case;

  insert into public.stock_balances (organization_id, material_id, variant_id)
  values (new.organization_id, new.material_id, new.variant_id)
  on conflict do nothing;

  select * into v_balance from public.stock_balances
  where (new.material_id is not null and material_id = new.material_id)
     or (new.variant_id is not null and variant_id = new.variant_id)
  for update;

  -- Custo médio ponderado (mesma regra de src/lib/stock/cost.ts).
  if new.type = 'entrada' and new.material_id is not null and new.unit_cost is not null then
    select avg_cost into v_avg from public.materials where id = new.material_id;
    v_available_before := greatest(v_balance.on_hand, 0);
    update public.materials
    set avg_cost = round(
      (v_available_before * v_avg + new.quantity * new.unit_cost) / (v_available_before + new.quantity),
      4
    )
    where id = new.material_id;
  end if;

  update public.stock_balances
  set on_hand = on_hand + v_on_hand_delta,
      reserved = greatest(reserved + v_reserved_delta, 0),
      updated_at = now()
  where id = v_balance.id;

  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- Baixa pela ficha técnica: consome os insumos de N unidades de uma variação.
-- Usada pela venda de balcão agora e pelos pedidos na Fase 3.
create or replace function public.consume_bom(p_variant uuid, p_quantity numeric, p_reference text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer := 0;
  v_item record;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  select organization_id into v_org from public.product_variants where id = p_variant;
  if v_org is null then
    raise exception 'Variação não encontrada.' using errcode = 'P0002';
  end if;
  if not private.has_any_permission(v_org, 'estoque.gerenciar', 'pedidos.gerenciar') then
    raise exception 'Sem permissão para dar baixa no estoque.' using errcode = '42501';
  end if;

  for v_item in
    select material_id, quantity, waste_pct from public.bom_items where variant_id = p_variant
  loop
    insert into public.stock_movements (organization_id, material_id, type, quantity, reason, reference, created_by)
    values (
      v_org,
      v_item.material_id,
      'consumo',
      round(p_quantity * v_item.quantity * (1 + v_item.waste_pct / 100), 3),
      'Baixa pela ficha técnica',
      p_reference,
      (select auth.uid())
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.consume_bom(uuid, numeric, text) from public, anon;
grant execute on function public.consume_bom(uuid, numeric, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Visões de estoque (respeitam o RLS de quem consulta)
-- -----------------------------------------------------------------------------

-- Insumos com saldo, alerta de mínimo e sugestão de compra (até 2× o mínimo).
create view public.material_stock
with (security_invoker = true)
as
select
  m.id as material_id,
  m.organization_id,
  m.name,
  m.unit,
  m.avg_cost,
  m.min_stock,
  m.supplier_id,
  m.active,
  coalesce(b.on_hand, 0) as on_hand,
  coalesce(b.reserved, 0) as reserved,
  coalesce(b.on_hand, 0) - coalesce(b.reserved, 0) as available,
  (m.min_stock > 0 and coalesce(b.on_hand, 0) - coalesce(b.reserved, 0) < m.min_stock) as below_min,
  greatest(m.min_stock * 2 - (coalesce(b.on_hand, 0) - coalesce(b.reserved, 0)), 0) as suggested_purchase,
  round(coalesce(b.on_hand, 0) * m.avg_cost, 2) as stock_value
from public.materials m
left join public.stock_balances b on b.material_id = m.id;

-- Quantas unidades de cada variação dá para entregar: prontas + produzíveis com os insumos.
-- Mesma regra de src/lib/stock/availability.ts (há teste).
create view public.variant_availability
with (security_invoker = true)
as
with producible as (
  select
    bi.variant_id,
    min(floor(
      greatest(coalesce(b.on_hand, 0) - coalesce(b.reserved, 0), 0)
      / (bi.quantity * (1 + bi.waste_pct / 100))
    )) as units,
    count(*) as bom_items
  from public.bom_items bi
  left join public.stock_balances b on b.material_id = bi.material_id
  group by bi.variant_id
)
select
  v.id as variant_id,
  v.organization_id,
  v.product_id,
  v.sku,
  p.fulfillment,
  case when p.fulfillment = 'pronta_entrega'
    then greatest(coalesce(vb.on_hand, 0) - coalesce(vb.reserved, 0), 0) else 0 end as ready_units,
  pr.units as producible_units,
  coalesce(pr.bom_items, 0) as bom_items,
  (case when p.fulfillment = 'pronta_entrega'
    then greatest(coalesce(vb.on_hand, 0) - coalesce(vb.reserved, 0), 0) else 0 end)
    + coalesce(pr.units, 0) as available_units
from public.product_variants v
join public.products p on p.id = v.product_id
left join public.stock_balances vb on vb.variant_id = v.id
left join producible pr on pr.variant_id = v.id;

-- -----------------------------------------------------------------------------
-- updated_at e auditoria
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'suppliers', 'product_categories', 'products', 'product_variants',
    'channel_price_rules', 'variant_channel_prices', 'materials', 'bom_items', 'payment_methods'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;

  foreach t in array array[
    'customers', 'suppliers', 'product_categories', 'products', 'product_variants',
    'channel_price_rules', 'variant_channel_prices', 'materials', 'bom_items', 'payment_methods'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.channel_price_rules enable row level security;
alter table public.variant_channel_prices enable row level security;
alter table public.materials enable row level security;
alter table public.bom_items enable row level security;
alter table public.payment_methods enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;

-- Clientes: dados pessoais — cadastros e pedidos.
create policy "Ler clientes" on public.customers for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'pedidos.ver')));
create policy "Cadastrar clientes" on public.customers for insert to authenticated
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'pedidos.gerenciar')));
create policy "Editar clientes" on public.customers for update to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'pedidos.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'pedidos.gerenciar')));

-- Catálogo (produtos, variações, preços, fotos, categorias): leitura ampla, escrita por cadastros.
do $$
declare
  t text;
begin
  foreach t in array array[
    'product_categories', 'products', 'product_variants', 'product_images',
    'channel_price_rules', 'variant_channel_prices', 'bom_items'
  ] loop
    execute format($f$
      create policy "Ler" on public.%1$I for select to authenticated
        using ((select private.has_any_permission(organization_id,
          'cadastros.ver', 'estoque.ver', 'pedidos.ver', 'pcp.ver', 'artes.ver', 'expedicao.ver')));
      create policy "Cadastrar" on public.%1$I for insert to authenticated
        with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));
      create policy "Editar" on public.%1$I for update to authenticated
        using ((select private.has_permission(organization_id, 'cadastros.gerenciar')))
        with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));
      create policy "Excluir" on public.%1$I for delete to authenticated
        using ((select private.has_permission(organization_id, 'cadastros.gerenciar')));
    $f$, t);
  end loop;
end;
$$;

-- Fornecedores e formas de pagamento: cadastros e financeiro.
create policy "Ler fornecedores" on public.suppliers for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'estoque.ver', 'financeiro.ver')));
create policy "Cadastrar fornecedores" on public.suppliers for insert to authenticated
  with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));
create policy "Editar fornecedores" on public.suppliers for update to authenticated
  using ((select private.has_permission(organization_id, 'cadastros.gerenciar')))
  with check ((select private.has_permission(organization_id, 'cadastros.gerenciar')));

create policy "Ler formas de pagamento" on public.payment_methods for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'pedidos.ver', 'financeiro.ver')));
create policy "Cadastrar formas de pagamento" on public.payment_methods for insert to authenticated
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'financeiro.gerenciar')));
create policy "Editar formas de pagamento" on public.payment_methods for update to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'financeiro.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'financeiro.gerenciar')));

-- Insumos: cadastro e estoque.
create policy "Ler insumos" on public.materials for select to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.ver', 'estoque.ver', 'pcp.ver')));
create policy "Cadastrar insumos" on public.materials for insert to authenticated
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'estoque.gerenciar')));
create policy "Editar insumos" on public.materials for update to authenticated
  using ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'estoque.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'cadastros.gerenciar', 'estoque.gerenciar')));

-- Estoque: saldos só leitura (gatilho escreve); movimentações só inserção.
create policy "Ler saldos" on public.stock_balances for select to authenticated
  using ((select private.has_any_permission(organization_id, 'estoque.ver', 'cadastros.ver', 'pedidos.ver', 'pcp.ver')));
create policy "Ler movimentações" on public.stock_movements for select to authenticated
  using ((select private.has_permission(organization_id, 'estoque.ver')));
create policy "Lançar movimentações" on public.stock_movements for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'estoque.gerenciar'))
    and created_by = (select auth.uid())
  );

revoke all on public.customers, public.suppliers, public.product_categories, public.products,
  public.product_variants, public.product_images, public.channel_price_rules,
  public.variant_channel_prices, public.materials, public.bom_items, public.payment_methods,
  public.stock_balances, public.stock_movements from anon;
revoke insert, update, delete on public.stock_balances from authenticated;
revoke update, delete on public.stock_movements from authenticated;
-- Sem exclusão de cadastros com histórico: desativa-se (active = false).
revoke delete on public.customers, public.suppliers, public.materials, public.payment_methods from authenticated;
revoke all on public.material_stock, public.variant_availability from anon;

-- -----------------------------------------------------------------------------
-- Storage: fotos de produtos (bucket privado, pasta = id da gráfica)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Ler fotos de produtos da gráfica" on storage.objects for select to authenticated
  using (
    bucket_id = 'produtos'
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'cadastros.ver', 'estoque.ver', 'pedidos.ver', 'pcp.ver', 'artes.ver', 'expedicao.ver'))
  );
create policy "Enviar fotos de produtos da gráfica" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'produtos'
    and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'cadastros.gerenciar'))
  );
create policy "Apagar fotos de produtos da gráfica" on storage.objects for delete to authenticated
  using (
    bucket_id = 'produtos'
    and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'cadastros.gerenciar'))
  );

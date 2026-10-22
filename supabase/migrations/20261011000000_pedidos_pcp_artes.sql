-- =============================================================================
-- Fase 3 — Pedidos + PCP + Aprovação de Artes
--   Pedidos de todos os canais (com orçamento como status), itens com preço do
--   canal, linha do tempo, número sequencial por gráfica.
--   Estoque: ao confirmar o pedido os insumos são reservados pela ficha técnica;
--   ao entrar em "Em Impressão" a reserva vira baixa (pronta-entrega: no envio).
--   Artes: link público por pedido (token aleatório), arquivos do cliente,
--   provas versionadas com marca d'água, aprovação com prova de aceite.
--   PCP: Kanban em tempo real (Supabase Realtime) com mudança de status por RPC.
-- Tudo isolado por gráfica (organization_id) e protegido por permissão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
-- A ordem importa: a comparação entre status (<, >) segue esta sequência.
create type public.order_status as enum (
  'orcamento',
  'novo',
  'aguardando_arte',
  'arte_em_criacao',
  'aguardando_aprovacao',
  'aprovado',
  'em_impressao',
  'acabamento',
  'expedicao',
  'enviado',
  'entregue',
  'cancelado'
);

create type public.order_item_stock as enum ('livre', 'reservado', 'baixado');
create type public.art_version_status as enum ('pendente', 'aprovada', 'alteracao', 'substituida');
create type public.order_event_type as enum (
  'criado', 'status', 'comentario', 'link_arte', 'arquivo_cliente',
  'prova', 'arte_aprovada', 'alteracao_pedida', 'arte_final'
);

comment on type public.order_item_stock is
  'livre: nada no estoque; reservado: insumos/peças separados; baixado: consumidos (irreversível).';

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table public.order_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  last_number integer not null default 1000
);

comment on table public.order_counters is 'Último número de pedido de cada gráfica. Só o gatilho escreve.';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number integer not null default 0, -- o gatilho numera; o default só deixa o campo opcional na inclusão
  channel public.sales_channel not null default 'balcao',
  status public.order_status not null default 'novo',
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 160),
  customer_phone text check (customer_phone is null or customer_phone ~ '^[0-9]{10,13}$'),
  needs_art boolean not null default true,
  due_date date,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  shipping numeric(12, 2) not null default 0 check (shipping >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  tracking_code text check (tracking_code is null or char_length(tracking_code) <= 60),
  external_id text check (external_id is null or char_length(external_id) <= 80),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  status_changed_at timestamptz not null default now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

comment on table public.orders is
  'Pedidos de todos os canais. Status muda só por public.change_order_status (ou pelas regras de arte).';
comment on column public.orders.due_date is 'Data limite de postagem/entrega.';
comment on column public.orders.customer_name is 'Cópia do nome do cliente (ou do comprador do marketplace) para a produção.';
comment on column public.orders.external_id is 'Id do pedido no marketplace (Fase 5).';

create index orders_board_idx on public.orders (organization_id, status, due_date);
create index orders_created_idx on public.orders (organization_id, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create unique index orders_external_idx on public.orders (organization_id, channel, external_id)
  where external_id is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  stock_state public.order_item_stock not null default 'livre',
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.order_items is 'Itens do pedido. Sem variação = serviço avulso (não mexe no estoque).';

create index order_items_order_idx on public.order_items (order_id, position);
create index order_items_variant_idx on public.order_items (variant_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  type public.order_event_type not null,
  from_status public.order_status,
  to_status public.order_status,
  message text check (message is null or char_length(message) <= 2000),
  actor_id uuid default auth.uid() references auth.users (id) on delete set null,
  actor_label text check (actor_label is null or char_length(actor_label) <= 120),
  created_at timestamptz not null default now()
);

comment on table public.order_events is 'Linha do tempo do pedido. Só inclusão; a equipe insere apenas comentários.';

create index order_events_order_idx on public.order_events (order_id, created_at);

-- Movimentações de estoque passam a saber de qual item de pedido vieram.
alter table public.stock_movements
  add column order_item_id uuid references public.order_items (id) on delete set null;

create index stock_movements_order_item_idx on public.stock_movements (order_item_id)
  where order_item_id is not null;

-- -----------------------------------------------------------------------------
-- Artes
-- -----------------------------------------------------------------------------
create table public.art_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  -- 24 bytes aleatórios em base64url (32 caracteres): impossível de adivinhar.
  token text not null unique
    default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_')
    check (char_length(token) >= 32),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz,
  last_access_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.art_links is
  'Link público do cliente (sem login). Gerar um novo revoga o anterior do mesmo pedido.';

create index art_links_order_idx on public.art_links (order_id);

create table public.art_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  mime_type text check (mime_type is null or char_length(mime_type) <= 120),
  note text check (note is null or char_length(note) <= 1000),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.art_files is 'Arquivos e referências enviados pelo cliente (ou pela equipe em nome dele).';
comment on column public.art_files.uploaded_by is 'Nulo quando o próprio cliente enviou pelo link.';

create index art_files_order_idx on public.art_files (order_id, created_at);

create table public.art_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  version smallint not null,
  proof_path text not null,
  proof_mime text not null check (proof_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  final_path text,
  final_name text check (final_name is null or char_length(final_name) <= 200),
  note text check (note is null or char_length(note) <= 1000),
  status public.art_version_status not null default 'pendente',
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (order_id, version)
);

comment on table public.art_versions is
  'Provas (v1, v2…). proof_path tem marca d''água e é o que o cliente vê; final_path é o arquivo em alta (só equipe).';

create table public.art_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  version_id uuid not null references public.art_versions (id) on delete cascade,
  decision text not null check (decision in ('aprovada', 'alteracao')),
  comment text check (comment is null or char_length(comment) <= 2000),
  pins jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pins) = 'array' and jsonb_array_length(pins) <= 30),
  reviewer_name text check (reviewer_name is null or char_length(reviewer_name) <= 120),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.art_reviews is 'Decisões do cliente sobre as provas: prova de aceite (data, IP, versão).';

create index art_reviews_order_idx on public.art_reviews (order_id, created_at);

-- Limite de tentativas das rotas públicas (link de arte).
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- -----------------------------------------------------------------------------
-- Regras: número, totais, mesma gráfica, datas de status
-- -----------------------------------------------------------------------------
create or replace function private.orders_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_counters (organization_id) values (new.organization_id)
    on conflict do nothing;
    update public.order_counters
    set last_number = last_number + 1
    where organization_id = new.organization_id
    returning last_number into new.number;
    new.subtotal := 0;
    new.status_changed_at := now();
  else
    if new.organization_id <> old.organization_id or new.number <> old.number then
      raise exception 'Não é possível mudar a gráfica ou o número do pedido.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      new.status_changed_at := now();
      if new.status = 'aprovado' and old.approved_at is null then new.approved_at := now(); end if;
      if new.status = 'enviado' then new.shipped_at := coalesce(old.shipped_at, now()); end if;
      if new.status = 'entregue' then new.delivered_at := now(); end if;
    end if;
  end if;

  if new.customer_id is not null
     and not exists (select 1 from public.customers c where c.id = new.customer_id and c.organization_id = new.organization_id) then
    raise exception 'Cliente de outra gráfica.' using errcode = '42501';
  end if;
  if new.payment_method_id is not null
     and not exists (select 1 from public.payment_methods p where p.id = new.payment_method_id and p.organization_id = new.organization_id) then
    raise exception 'Forma de pagamento de outra gráfica.' using errcode = '42501';
  end if;

  new.total := new.subtotal - new.discount + new.shipping;
  if new.total < 0 then
    raise exception 'O desconto é maior que o valor do pedido.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger orders_before_write
  before insert or update on public.orders
  for each row execute function private.orders_before_write();

-- Item e arquivos de arte precisam ser da mesma gráfica do pedido.
create or replace function private.check_order_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.organization_id = new.organization_id) then
    raise exception 'Pedido de outra gráfica.' using errcode = '42501';
  end if;
  -- if aninhado: só order_items tem variant_id (o PL/pgSQL não garante curto-circuito no "and").
  if tg_table_name = 'order_items' then
    if (to_jsonb(new) ->> 'variant_id') is not null
       and not exists (
         select 1 from public.product_variants v
         where v.id = (to_jsonb(new) ->> 'variant_id')::uuid and v.organization_id = new.organization_id
       ) then
      raise exception 'Variação de outra gráfica.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger order_items_check_org before insert or update on public.order_items
  for each row execute function private.check_order_child();
create trigger art_links_check_org before insert on public.art_links
  for each row execute function private.check_order_child();
create trigger art_files_check_org before insert on public.art_files
  for each row execute function private.check_order_child();
create trigger art_versions_check_org before insert on public.art_versions
  for each row execute function private.check_order_child();

-- Recalcula o subtotal quando os itens mudam.
create or replace function private.recalc_order_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
  set subtotal = coalesce((
    select round(sum(i.quantity * i.unit_price), 2) from public.order_items i where i.order_id = v_order
  ), 0)
  where o.id = v_order;
  return null;
end;
$$;

create trigger order_items_subtotal
  after insert or update of quantity, unit_price or delete on public.order_items
  for each row execute function private.recalc_order_subtotal();

-- -----------------------------------------------------------------------------
-- Estoque dos pedidos
-- -----------------------------------------------------------------------------

-- Estado de estoque que um item deve ter para o status do pedido.
-- Mesma regra de src/lib/orders/status.ts (há teste).
create or replace function private.order_item_target_state(
  p_status public.order_status,
  p_fulfillment public.fulfillment_mode
)
returns public.order_item_stock
language sql
immutable
set search_path = ''
as $$
  select (case
    when p_status in ('orcamento', 'cancelado') then 'livre'
    when p_status < 'em_impressao' then 'reservado'
    when p_fulfillment = 'pronta_entrega' and p_status < 'enviado' then 'reservado'
    else 'baixado'
  end)::public.order_item_stock
$$;

-- Devolve ao disponível tudo o que este item ainda tem reservado.
create or replace function private.release_item_stock(p_item public.order_items, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select material_id, variant_id,
      sum(case when type = 'reserva' then quantity else -quantity end) as net
    from public.stock_movements
    where order_item_id = p_item.id and type in ('reserva', 'liberacao')
    group by material_id, variant_id
  loop
    if r.net > 0 then
      insert into public.stock_movements
        (organization_id, material_id, variant_id, type, quantity, reason, reference, order_item_id, created_by)
      values
        (p_item.organization_id, r.material_id, r.variant_id, 'liberacao', r.net,
         'Reserva do pedido liberada', p_reference, p_item.id, (select auth.uid()));
    end if;
  end loop;
end;
$$;

-- Lança reserva (p_type = 'reserva') ou baixa (consumo dos insumos / saída da peça pronta).
create or replace function private.move_item_stock(
  p_item public.order_items,
  p_fulfillment public.fulfillment_mode,
  p_type public.stock_movement_type,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  v_qty numeric;
begin
  if p_fulfillment = 'pronta_entrega' then
    insert into public.stock_movements
      (organization_id, variant_id, type, quantity, reason, reference, order_item_id, created_by)
    values
      (p_item.organization_id, p_item.variant_id,
       case when p_type = 'reserva' then 'reserva' else 'saida' end::public.stock_movement_type,
       p_item.quantity,
       case when p_type = 'reserva' then 'Reserva para pedido' else 'Saída por pedido' end,
       p_reference, p_item.id, (select auth.uid()));
    return;
  end if;

  for b in select material_id, quantity, waste_pct from public.bom_items where variant_id = p_item.variant_id loop
    v_qty := round(p_item.quantity * b.quantity * (1 + b.waste_pct / 100), 3);
    if v_qty > 0 then
      insert into public.stock_movements
        (organization_id, material_id, type, quantity, reason, reference, order_item_id, created_by)
      values
        (p_item.organization_id, b.material_id,
         case when p_type = 'reserva' then 'reserva' else 'consumo' end::public.stock_movement_type,
         v_qty,
         case when p_type = 'reserva' then 'Reserva para pedido' else 'Consumo na produção do pedido' end,
         p_reference, p_item.id, (select auth.uid()));
    end if;
  end loop;
end;
$$;

-- Leva o item ao estado de estoque que o status do pedido pede.
-- p_refresh: o item mudou (quantidade/variação), então refaz a reserva.
create or replace function private.sync_item_stock(p_item_id uuid, p_refresh boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
  v_status public.order_status;
  v_number integer;
  v_mode public.fulfillment_mode;
  v_target public.order_item_stock;
  v_ref text;
begin
  select * into v_item from public.order_items where id = p_item_id for update;
  if v_item.id is null or v_item.stock_state = 'baixado' then
    return;
  end if;

  select o.status, o.number into v_status, v_number from public.orders o where o.id = v_item.order_id;
  v_ref := 'Pedido #' || v_number;

  -- Serviço avulso (sem variação) não mexe no estoque; se antes tinha variação, devolve a reserva.
  if v_item.variant_id is null then
    if v_item.stock_state = 'reservado' then
      perform private.release_item_stock(v_item, v_ref);
      update public.order_items set stock_state = 'livre' where id = p_item_id;
    end if;
    return;
  end if;

  select p.fulfillment into v_mode
  from public.product_variants v join public.products p on p.id = v.product_id
  where v.id = v_item.variant_id;

  v_target := private.order_item_target_state(v_status, v_mode);

  if v_target = 'livre' then
    if v_item.stock_state = 'reservado' then
      perform private.release_item_stock(v_item, v_ref);
    end if;
  elsif v_target = 'reservado' then
    if v_item.stock_state = 'reservado' and p_refresh then
      perform private.release_item_stock(v_item, v_ref);
      perform private.move_item_stock(v_item, v_mode, 'reserva', v_ref);
    elsif v_item.stock_state = 'livre' then
      perform private.move_item_stock(v_item, v_mode, 'reserva', v_ref);
    end if;
  else
    perform private.release_item_stock(v_item, v_ref);
    perform private.move_item_stock(v_item, v_mode, 'consumo', v_ref);
  end if;

  if v_item.stock_state is distinct from v_target then
    update public.order_items set stock_state = v_target where id = p_item_id;
  end if;
end;
$$;

create or replace function private.order_items_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  if tg_op = 'INSERT' then
    perform private.sync_item_stock(new.id);
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if new.quantity is distinct from old.quantity or new.variant_id is distinct from old.variant_id then
      perform private.sync_item_stock(new.id, true);
    end if;
    return null;
  end if;

  -- DELETE: devolve o que estava reservado. Em cascata (gráfica sendo removida) não lança nada.
  if old.stock_state = 'reservado' and pg_trigger_depth() = 1 then
    select 'Pedido #' || o.number into v_ref from public.orders o where o.id = old.order_id;
    perform private.release_item_stock(old, v_ref);
  end if;
  return old;
end;
$$;

create or replace function private.order_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Remoção em cascata (pedido ou gráfica apagados pelo servidor) não passa pela trava.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.stock_state = 'baixado' and (
    tg_op = 'DELETE'
    or new.quantity is distinct from old.quantity
    or new.variant_id is distinct from old.variant_id
  ) then
    raise exception 'Este item já foi baixado do estoque e não pode mudar.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    raise exception 'Não é possível mover o item para outro pedido.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger order_items_guard
  before update or delete on public.order_items
  for each row execute function private.order_items_guard();

create trigger order_items_stock_after
  after insert or update of quantity, variant_id on public.order_items
  for each row execute function private.order_items_stock();

create trigger order_items_stock_before_delete
  before delete on public.order_items
  for each row execute function private.order_items_stock();

-- -----------------------------------------------------------------------------
-- Status: permissões, mudança e linha do tempo
-- -----------------------------------------------------------------------------

-- Quem pode mover o pedido de um status para outro.
-- Mesma regra de src/lib/orders/status.ts (há teste).
create or replace function private.can_set_order_status(
  org uuid,
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.has_permission(org, 'pedidos.gerenciar')
    or (
      p_from not in ('orcamento', 'cancelado') and p_to not in ('orcamento', 'cancelado')
      and (
        (private.has_permission(org, 'artes.gerenciar')
          and p_from between 'novo' and 'aprovado' and p_to between 'novo' and 'aprovado')
        or (private.has_permission(org, 'pcp.gerenciar')
          and p_from between 'novo' and 'expedicao' and p_to between 'novo' and 'expedicao')
        or (private.has_permission(org, 'expedicao.gerenciar')
          and p_from between 'expedicao' and 'entregue' and p_to between 'expedicao' and 'entregue')
      )
    )
$$;

revoke all on function private.can_set_order_status(uuid, public.order_status, public.order_status) from public;
grant execute on function private.can_set_order_status(uuid, public.order_status, public.order_status) to authenticated;

create or replace function public.change_order_status(
  p_order uuid,
  p_status public.order_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_current public.order_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select organization_id, status into v_org, v_current from public.orders where id = p_order for update;
  if v_org is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if v_current = p_status then
    return;
  end if;
  if not private.can_set_order_status(v_org, v_current, p_status) then
    raise exception 'Sem permissão para mudar o pedido para este status.' using errcode = '42501';
  end if;
  if p_status = 'cancelado' and v_note is null then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Observação longa demais.' using errcode = '22023';
  end if;

  perform set_config('app.status_note', coalesce(v_note, ''), true);
  update public.orders
  set status = p_status,
      cancel_reason = case when p_status = 'cancelado' then v_note else cancel_reason end
  where id = p_order;
end;
$$;

revoke all on function public.change_order_status(uuid, public.order_status, text) from public, anon;
grant execute on function public.change_order_status(uuid, public.order_status, text) to authenticated;

-- Registra o evento e acerta o estoque de todos os itens.
create or replace function private.orders_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
  v_label text := nullif(current_setting('app.actor_label', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (organization_id, order_id, type, to_status, actor_id, actor_label)
    values (new.organization_id, new.id, 'criado', new.status, (select auth.uid()), v_label);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events
      (organization_id, order_id, type, from_status, to_status, message, actor_id, actor_label)
    values
      (new.organization_id, new.id, 'status', old.status, new.status,
       nullif(current_setting('app.status_note', true), ''), (select auth.uid()), v_label);
    perform set_config('app.status_note', '', true);

    for v_item in select id from public.order_items where order_id = new.id loop
      perform private.sync_item_stock(v_item);
    end loop;
  end if;
  return null;
end;
$$;

create trigger orders_after_write
  after insert or update of status on public.orders
  for each row execute function private.orders_after_write();

-- -----------------------------------------------------------------------------
-- Gravação do pedido com os itens numa transação só.
-- security invoker: roda com as permissões de quem chama (o RLS vale).
-- -----------------------------------------------------------------------------

-- Sincroniza os itens: atualiza os que têm id, inclui os novos e remove os que saíram.
create or replace function public.save_order_items(p_order uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_keep uuid[];
  v_item jsonb;
  v_pos smallint := 0;
  v_id uuid;
begin
  select organization_id into v_org from public.orders where id = p_order;
  if v_org is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Inclua pelo menos um item.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Máximo de 100 itens por pedido.' using errcode = '22023';
  end if;

  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
  into v_keep
  from jsonb_array_elements(p_items) e
  where nullif(e ->> 'id', '') is not null;

  delete from public.order_items where order_id = p_order and not (id = any (v_keep));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    v_id := nullif(v_item ->> 'id', '')::uuid;
    if v_id is null then
      insert into public.order_items (organization_id, order_id, variant_id, description, quantity, unit_price, position)
      values (v_org, p_order, nullif(v_item ->> 'variant_id', '')::uuid, v_item ->> 'description',
              (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::numeric, v_pos);
    else
      update public.order_items i
      set variant_id = nullif(v_item ->> 'variant_id', '')::uuid,
          description = v_item ->> 'description',
          quantity = (v_item ->> 'quantity')::numeric,
          unit_price = (v_item ->> 'unit_price')::numeric,
          position = v_pos
      where i.id = v_id and i.order_id = p_order
        and (i.variant_id is distinct from nullif(v_item ->> 'variant_id', '')::uuid
          or i.description is distinct from v_item ->> 'description'
          or i.quantity is distinct from (v_item ->> 'quantity')::numeric
          or i.unit_price is distinct from (v_item ->> 'unit_price')::numeric
          or i.position is distinct from v_pos);
    end if;
  end loop;
end;
$$;

-- Campos editáveis do cabeçalho (o desconto entra por último, depois dos itens).
create or replace function private.apply_order_fields(p_order uuid, p_fields jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.orders
  set channel = coalesce((p_fields ->> 'channel')::public.sales_channel, channel),
      customer_id = nullif(p_fields ->> 'customer_id', '')::uuid,
      customer_name = p_fields ->> 'customer_name',
      customer_phone = nullif(p_fields ->> 'customer_phone', ''),
      needs_art = coalesce((p_fields ->> 'needs_art')::boolean, needs_art),
      due_date = nullif(p_fields ->> 'due_date', '')::date,
      payment_method_id = nullif(p_fields ->> 'payment_method_id', '')::uuid,
      shipping = coalesce((p_fields ->> 'shipping')::numeric, 0),
      discount = coalesce((p_fields ->> 'discount')::numeric, 0),
      notes = nullif(p_fields ->> 'notes', '')
  where id = p_order
$$;

create or replace function public.create_order(p_org uuid, p_status public.order_status, p_fields jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.orders (organization_id, status, customer_name)
  values (p_org, p_status, p_fields ->> 'customer_name')
  returning id into v_id;

  perform public.save_order_items(v_id, p_items);
  perform private.apply_order_fields(v_id, p_fields);
  return v_id;
end;
$$;

create or replace function public.update_order(p_order uuid, p_fields jsonb, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Zera o desconto antes de mexer nos itens para o total nunca ficar negativo no meio do caminho.
  update public.orders set discount = 0 where id = p_order;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  perform public.save_order_items(p_order, p_items);
  perform private.apply_order_fields(p_order, p_fields);
end;
$$;

revoke all on function public.save_order_items(uuid, jsonb) from public, anon;
revoke all on function public.create_order(uuid, public.order_status, jsonb, jsonb) from public, anon;
revoke all on function public.update_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function private.apply_order_fields(uuid, jsonb) from public;
grant execute on function public.save_order_items(uuid, jsonb) to authenticated;
grant execute on function public.create_order(uuid, public.order_status, jsonb, jsonb) to authenticated;
grant execute on function public.update_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function private.apply_order_fields(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Artes: regras
-- -----------------------------------------------------------------------------

-- Novo link revoga os anteriores do mesmo pedido.
create or replace function private.art_links_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.art_links set revoked_at = now()
  where order_id = new.order_id and revoked_at is null;

  insert into public.order_events (organization_id, order_id, type, actor_id)
  values (new.organization_id, new.order_id, 'link_arte', (select auth.uid()));
  return new;
end;
$$;

create trigger art_links_before_insert
  before insert on public.art_links
  for each row execute function private.art_links_before_insert();

-- Nova prova: numera (v1, v2…), substitui a pendente e leva o pedido para "Aguardando Aprovação".
create or replace function private.art_versions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.orders where id = new.order_id for update;
  if v_status in ('orcamento', 'cancelado') or v_status >= 'em_impressao' then
    raise exception 'Este pedido não está na etapa de arte.' using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into new.version from public.art_versions where order_id = new.order_id;
  new.status := 'pendente';
  new.reviewed_at := null;

  update public.art_versions set status = 'substituida'
  where order_id = new.order_id and status = 'pendente';

  insert into public.order_events (organization_id, order_id, type, message, actor_id)
  values (new.organization_id, new.order_id, 'prova', 'Prova v' || new.version || ' enviada ao cliente', (select auth.uid()));

  if v_status <> 'aguardando_aprovacao' then
    update public.orders set status = 'aguardando_aprovacao' where id = new.order_id;
  end if;
  return new;
end;
$$;

create trigger art_versions_before_insert
  before insert on public.art_versions
  for each row execute function private.art_versions_before_insert();

-- Arquivo final em alta: registra na linha do tempo.
create or replace function private.art_versions_after_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.final_path is not null and new.final_path is distinct from old.final_path then
    insert into public.order_events (organization_id, order_id, type, message, actor_id)
    values (new.organization_id, new.order_id, 'arte_final',
            'Arquivo final da v' || new.version || ': ' || coalesce(new.final_name, 'enviado'), (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger art_versions_after_final
  after update of final_path on public.art_versions
  for each row execute function private.art_versions_after_final();

-- -----------------------------------------------------------------------------
-- Rotas públicas (só o servidor, com a chave secreta, chama estas funções)
-- -----------------------------------------------------------------------------

-- Conta uma tentativa; devolve false quando passou do limite na janela.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
  set hits = case
        when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else r.hits + 1
      end,
      window_start = case
        when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else r.window_start
      end
  returning hits into v_hits;

  -- Faxina ocasional das janelas antigas.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;

-- Valida o token do link e devolve o pedido. Marca o último acesso.
create or replace function public.resolve_art_link(p_token text)
returns table (link_id uuid, organization_id uuid, order_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.art_links l
  set last_access_at = now()
  where l.token = p_token
    and l.revoked_at is null
    and l.expires_at > now()
  returning l.id, l.organization_id, l.order_id;
end;
$$;

-- Cliente enviou um arquivo pelo link.
create or replace function public.register_client_art_file(
  p_token text,
  p_path text,
  p_file_name text,
  p_size bigint,
  p_mime text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link record;
  v_status public.order_status;
  v_id uuid;
begin
  select * into v_link from public.resolve_art_link(p_token);
  if v_link.order_id is null then
    raise exception 'Link inválido ou expirado.' using errcode = '42501';
  end if;
  if p_path not like v_link.organization_id || '/' || v_link.order_id || '/cliente/%' then
    raise exception 'Caminho de arquivo inválido.' using errcode = '42501';
  end if;

  perform set_config('app.actor_label', 'Cliente', true);

  insert into public.art_files (organization_id, order_id, path, file_name, size_bytes, mime_type, note, uploaded_by)
  values (v_link.organization_id, v_link.order_id, p_path, p_file_name, p_size, p_mime,
          nullif(btrim(coalesce(p_note, '')), ''), null)
  returning id into v_id;

  insert into public.order_events (organization_id, order_id, type, message, actor_id, actor_label)
  values (v_link.organization_id, v_link.order_id, 'arquivo_cliente', p_file_name, null, 'Cliente');

  select status into v_status from public.orders where id = v_link.order_id for update;
  if v_status in ('novo', 'aguardando_arte') then
    update public.orders set status = 'arte_em_criacao' where id = v_link.order_id;
  end if;
  return v_id;
end;
$$;

-- Cliente aprovou ou pediu alteração da prova.
create or replace function public.submit_art_review(
  p_token text,
  p_version_id uuid,
  p_decision text,
  p_comment text,
  p_pins jsonb,
  p_reviewer_name text,
  p_ip inet,
  p_user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link record;
  v_version public.art_versions;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_link from public.resolve_art_link(p_token);
  if v_link.order_id is null then
    raise exception 'Link inválido ou expirado.' using errcode = '42501';
  end if;

  select * into v_version from public.art_versions
  where id = p_version_id and order_id = v_link.order_id
  for update;
  if v_version.id is null then
    raise exception 'Prova não encontrada.' using errcode = 'P0002';
  end if;
  if v_version.status <> 'pendente' then
    raise exception 'Esta prova já foi respondida ou foi substituída.' using errcode = '23514';
  end if;
  if p_decision = 'alteracao' and v_comment is null then
    raise exception 'Conte o que precisa mudar.' using errcode = '22023';
  end if;

  insert into public.art_reviews
    (organization_id, order_id, version_id, decision, comment, pins, reviewer_name, ip, user_agent)
  values
    (v_link.organization_id, v_link.order_id, v_version.id, p_decision, v_comment,
     coalesce(p_pins, '[]'::jsonb), nullif(btrim(coalesce(p_reviewer_name, '')), ''),
     p_ip, left(p_user_agent, 500));

  update public.art_versions
  set status = case when p_decision = 'aprovada' then 'aprovada' else 'alteracao' end::public.art_version_status,
      reviewed_at = now()
  where id = v_version.id;

  perform set_config('app.actor_label', 'Cliente', true);

  insert into public.order_events (organization_id, order_id, type, message, actor_id, actor_label)
  values (
    v_link.organization_id, v_link.order_id,
    case when p_decision = 'aprovada' then 'arte_aprovada' else 'alteracao_pedida' end::public.order_event_type,
    case when p_decision = 'aprovada'
      then 'v' || v_version.version || ' aprovada' || coalesce(': ' || v_comment, '')
      else 'v' || v_version.version || ': ' || v_comment end,
    null, 'Cliente'
  );

  update public.orders
  set status = case when p_decision = 'aprovada' then 'aprovado' else 'arte_em_criacao' end::public.order_status
  where id = v_link.order_id and status = 'aguardando_aprovacao';
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.resolve_art_link(text) from public, anon, authenticated;
revoke all on function public.register_client_art_file(text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.submit_art_review(text, uuid, text, text, jsonb, text, inet, text) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.resolve_art_link(text) to service_role;
grant execute on function public.register_client_art_file(text, text, text, bigint, text, text) to service_role;
grant execute on function public.submit_art_review(text, uuid, text, text, jsonb, text, inet, text) to service_role;

-- -----------------------------------------------------------------------------
-- updated_at e auditoria
-- -----------------------------------------------------------------------------
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger order_items_set_updated_at before update on public.order_items
  for each row execute function private.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items', 'art_links', 'art_versions', 'art_reviews'] loop
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
alter table public.order_counters enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.art_links enable row level security;
alter table public.art_files enable row level security;
alter table public.art_versions enable row level security;
alter table public.art_reviews enable row level security;
alter table private.rate_limits enable row level security;

-- Pedidos: quem trabalha em qualquer etapa lê; só pedidos.gerenciar cria e edita.
create policy "Ler pedidos" on public.orders for select to authenticated
  using ((select private.has_any_permission(organization_id,
    'pedidos.ver', 'artes.ver', 'pcp.ver', 'expedicao.ver')));
create policy "Criar pedidos" on public.orders for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'pedidos.gerenciar'))
    and status in ('orcamento', 'novo', 'aguardando_arte')
    and created_by = (select auth.uid())
  );
create policy "Editar pedidos" on public.orders for update to authenticated
  using ((select private.has_permission(organization_id, 'pedidos.gerenciar')))
  with check ((select private.has_permission(organization_id, 'pedidos.gerenciar')));

create policy "Ler itens" on public.order_items for select to authenticated
  using ((select private.has_any_permission(organization_id,
    'pedidos.ver', 'artes.ver', 'pcp.ver', 'expedicao.ver')));
create policy "Incluir itens" on public.order_items for insert to authenticated
  with check ((select private.has_permission(organization_id, 'pedidos.gerenciar')));
create policy "Editar itens" on public.order_items for update to authenticated
  using ((select private.has_permission(organization_id, 'pedidos.gerenciar')))
  with check ((select private.has_permission(organization_id, 'pedidos.gerenciar')));
create policy "Remover itens" on public.order_items for delete to authenticated
  using ((select private.has_permission(organization_id, 'pedidos.gerenciar')));

create policy "Ler linha do tempo" on public.order_events for select to authenticated
  using ((select private.has_any_permission(organization_id,
    'pedidos.ver', 'artes.ver', 'pcp.ver', 'expedicao.ver')));
create policy "Comentar" on public.order_events for insert to authenticated
  with check (
    type = 'comentario'
    and actor_id = (select auth.uid())
    and from_status is null and to_status is null and actor_label is null
    and (select private.has_any_permission(organization_id,
      'pedidos.gerenciar', 'artes.gerenciar', 'pcp.gerenciar', 'expedicao.gerenciar'))
  );

-- Artes: leitura por pedidos/artes/pcp; escrita por artes ou pedidos.
create policy "Ler links de arte" on public.art_links for select to authenticated
  using ((select private.has_any_permission(organization_id, 'pedidos.ver', 'artes.ver')));
create policy "Gerar links de arte" on public.art_links for insert to authenticated
  with check (
    (select private.has_any_permission(organization_id, 'pedidos.gerenciar', 'artes.gerenciar'))
    and created_by = (select auth.uid())
  );
create policy "Revogar links de arte" on public.art_links for update to authenticated
  using ((select private.has_any_permission(organization_id, 'pedidos.gerenciar', 'artes.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'pedidos.gerenciar', 'artes.gerenciar')));

create policy "Ler arquivos de arte" on public.art_files for select to authenticated
  using ((select private.has_any_permission(organization_id, 'pedidos.ver', 'artes.ver', 'pcp.ver')));
create policy "Anexar arquivos de arte" on public.art_files for insert to authenticated
  with check (
    (select private.has_any_permission(organization_id, 'pedidos.gerenciar', 'artes.gerenciar'))
    and uploaded_by = (select auth.uid())
  );

create policy "Ler provas" on public.art_versions for select to authenticated
  using ((select private.has_any_permission(organization_id, 'pedidos.ver', 'artes.ver', 'pcp.ver')));
create policy "Enviar provas" on public.art_versions for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'artes.gerenciar'))
    and uploaded_by = (select auth.uid())
  );
create policy "Anexar arquivo final" on public.art_versions for update to authenticated
  using ((select private.has_permission(organization_id, 'artes.gerenciar')))
  with check ((select private.has_permission(organization_id, 'artes.gerenciar')));

create policy "Ler respostas do cliente" on public.art_reviews for select to authenticated
  using ((select private.has_any_permission(organization_id, 'pedidos.ver', 'artes.ver', 'pcp.ver')));

-- Privilégios: nada para visitantes; colunas controladas para a equipe.
revoke all on public.order_counters, public.orders, public.order_items, public.order_events,
  public.art_links, public.art_files, public.art_versions, public.art_reviews from anon;
revoke all on public.order_counters from authenticated;
revoke all on private.rate_limits from anon, authenticated;

-- Status, número e totais só mudam pelas regras do banco.
revoke update on public.orders from authenticated;
grant update (channel, customer_id, customer_name, customer_phone, needs_art, due_date,
  payment_method_id, discount, shipping, notes, tracking_code) on public.orders to authenticated;
revoke delete on public.orders from authenticated;

revoke update on public.order_items from authenticated;
grant update (variant_id, description, quantity, unit_price, position) on public.order_items to authenticated;

revoke update, delete on public.order_events from authenticated;
revoke update on public.art_links from authenticated;
grant update (revoked_at) on public.art_links to authenticated;
revoke update, delete on public.art_files from authenticated;
revoke update on public.art_versions from authenticated;
grant update (final_path, final_name, note) on public.art_versions to authenticated;
revoke delete on public.art_versions from authenticated;
revoke insert, update, delete on public.art_reviews from authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: o Kanban recebe as mudanças de pedidos (o RLS vale aqui também)
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;

-- -----------------------------------------------------------------------------
-- Storage: artes (bucket privado; pasta = gráfica/pedido/{cliente|provas|final})
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('artes', 'artes', false, 52428800)
on conflict (id) do nothing;

create policy "Ler artes da gráfica" on storage.objects for select to authenticated
  using (
    bucket_id = 'artes'
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'pedidos.ver', 'artes.ver', 'pcp.ver'))
  );
create policy "Enviar artes da gráfica" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'artes'
    and (storage.foldername(name))[3] in ('cliente', 'provas', 'final')
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'pedidos.gerenciar', 'artes.gerenciar'))
  );

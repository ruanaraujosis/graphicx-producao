-- =============================================================================
-- Fase 4 — Financeiro básico + Dashboard para TV
--   Financeiro: contas a receber (automáticas a partir dos pedidos), contas a
--   pagar (com recorrência mensal), categorias de despesa, metas, fluxo de caixa,
--   DRE simplificado e margem por produto.
--   Faturamento por competência: conta na confirmação do pedido (orders.confirmed_at).
--   Custo dos insumos: cada baixa guarda o custo médio do momento (cost_at).
--   TV: dispositivos com link próprio (token), só leitura, valores em R$ opcionais.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pedido confirmado (quando deixa de ser orçamento): base do faturamento
-- -----------------------------------------------------------------------------
alter table public.orders add column confirmed_at timestamptz;

comment on column public.orders.confirmed_at is
  'Quando o pedido foi confirmado (saiu de orçamento). É a data do faturamento (competência).';

update public.orders set confirmed_at = created_at where status <> 'orcamento';

create index orders_confirmed_idx on public.orders (organization_id, confirmed_at)
  where confirmed_at is not null;

create or replace function private.orders_set_confirmed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.confirmed_at is null and new.status not in ('orcamento', 'cancelado') then
    new.confirmed_at := now();
  end if;
  if tg_op = 'UPDATE' and new.confirmed_at is distinct from old.confirmed_at and old.confirmed_at is not null then
    new.confirmed_at := old.confirmed_at;
  end if;
  return new;
end;
$$;

create trigger orders_set_confirmed_at
  before insert or update of status on public.orders
  for each row execute function private.orders_set_confirmed_at();

-- -----------------------------------------------------------------------------
-- Custo médio guardado em cada baixa de insumo
-- -----------------------------------------------------------------------------
alter table public.stock_movements add column cost_at numeric(14, 4);

comment on column public.stock_movements.cost_at is
  'Custo médio do insumo no momento da baixa (consumo/saída/perda). Base do custo no DRE.';

create or replace function private.stock_movements_cost_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cost_at := null;
  if new.material_id is not null and new.type in ('consumo', 'saida', 'perda') then
    select avg_cost into new.cost_at from public.materials where id = new.material_id;
  end if;
  return new;
end;
$$;

create trigger stock_movements_cost_at
  before insert on public.stock_movements
  for each row execute function private.stock_movements_cost_at();

-- Baixas antigas: usa o custo médio atual como melhor estimativa.
update public.stock_movements sm
set cost_at = m.avg_cost
from public.materials m
where m.id = sm.material_id and sm.type in ('consumo', 'saida', 'perda') and sm.cost_at is null;

-- -----------------------------------------------------------------------------
-- Categorias de despesa
-- -----------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

comment on table public.expense_categories is 'Categorias das contas a pagar (editáveis pela gráfica).';

create or replace function private.seed_expense_categories(org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.expense_categories (organization_id, name)
  select org, n from unnest(array[
    'Insumos e matéria-prima', 'Aluguel', 'Energia e água', 'Internet e telefone',
    'Salários e pró-labore', 'Impostos e taxas', 'Frete e correios',
    'Manutenção de máquinas', 'Marketing', 'Outras despesas'
  ]) as n
  on conflict do nothing
$$;

revoke all on function private.seed_expense_categories(uuid) from public;

create or replace function private.on_organization_created_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_expense_categories(new.id);
  return new;
end;
$$;

create trigger organizations_seed_finance
  after insert on public.organizations
  for each row execute function private.on_organization_created_finance();

select private.seed_expense_categories(id) from public.organizations;

-- -----------------------------------------------------------------------------
-- Contas a receber
-- -----------------------------------------------------------------------------
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid unique references public.orders (id) on delete set null,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  customer_name text check (customer_name is null or char_length(customer_name) <= 160),
  channel public.sales_channel,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  gross numeric(12, 2) not null check (gross >= 0),
  fee numeric(12, 2) not null default 0 check (fee >= 0 and fee <= gross),
  net numeric(12, 2) generated always as (gross - fee) stored,
  due_date date not null,
  received_at date,
  status text not null default 'aberto' check (status in ('aberto', 'recebido', 'cancelado')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'recebido') = (received_at is not null))
);

comment on table public.receivables is
  'Contas a receber. As de pedido nascem e acompanham o pedido sozinhas; as avulsas são lançadas pelo financeiro.';

create index receivables_due_idx on public.receivables (organization_id, status, due_date);
create index receivables_received_idx on public.receivables (organization_id, received_at)
  where received_at is not null;

-- Cria/atualiza a conta a receber do pedido conforme status, total e forma de pagamento.
create or replace function private.sync_order_receivable(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  r public.receivables;
  v_fee_pct numeric := 0;
  v_days integer := 0;
  v_fee numeric;
begin
  select id, organization_id, number, status, total, customer_name, channel, payment_method_id, confirmed_at
  into o from public.orders where id = p_order;
  if o.id is null then
    return;
  end if;

  select * into r from public.receivables where order_id = p_order for update;

  if o.status in ('orcamento', 'cancelado') then
    if r.id is not null and r.status = 'aberto' then
      update public.receivables set status = 'cancelado' where id = r.id;
    end if;
    return;
  end if;

  if o.payment_method_id is not null then
    select fee_pct, settlement_days into v_fee_pct, v_days
    from public.payment_methods where id = o.payment_method_id;
  end if;
  v_fee := round(o.total * coalesce(v_fee_pct, 0) / 100, 2);

  if r.id is null then
    insert into public.receivables
      (organization_id, order_id, description, customer_name, channel, payment_method_id, gross, fee, due_date, created_by)
    values
      (o.organization_id, o.id, 'Pedido #' || o.number, o.customer_name, o.channel, o.payment_method_id,
       o.total, v_fee,
       (coalesce(o.confirmed_at, now()) at time zone 'America/Sao_Paulo')::date + coalesce(v_days, 0),
       (select auth.uid()));
  elsif r.status <> 'recebido' then
    update public.receivables
    set gross = o.total,
        fee = least(v_fee, o.total),
        customer_name = o.customer_name,
        channel = o.channel,
        payment_method_id = o.payment_method_id,
        -- Vencimento só muda se a forma de pagamento mudou (o financeiro pode ter ajustado).
        due_date = case
          when r.payment_method_id is distinct from o.payment_method_id
            then (coalesce(o.confirmed_at, now()) at time zone 'America/Sao_Paulo')::date + coalesce(v_days, 0)
          else r.due_date
        end,
        status = 'aberto'
    where id = r.id;
  end if;
end;
$$;

create or replace function private.orders_sync_receivable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_order_receivable(new.id);
  return null;
end;
$$;

create trigger orders_sync_receivable
  after insert or update of status, total, payment_method_id, customer_name, channel on public.orders
  for each row execute function private.orders_sync_receivable();

-- Contas de pedidos já existentes.
select private.sync_order_receivable(id) from public.orders where status not in ('orcamento', 'cancelado');

-- Conta de pedido: o valor segue o pedido (a equipe não altera o bruto).
create or replace function private.receivables_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
    if new.order_id is distinct from old.order_id then
      raise exception 'Não é possível trocar o pedido da conta.' using errcode = '42501';
    end if;
    if old.order_id is not null and new.gross is distinct from old.gross then
      raise exception 'O valor da conta de um pedido acompanha o pedido. Edite o pedido.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger receivables_guard
  before update on public.receivables
  for each row execute function private.receivables_guard();

-- -----------------------------------------------------------------------------
-- Contas a pagar
-- -----------------------------------------------------------------------------
create table public.payables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  category_id uuid references public.expense_categories (id) on delete set null,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  paid_at date,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  recurrence text not null default 'nenhuma' check (recurrence in ('nenhuma', 'mensal')),
  series_id uuid,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pago') = (paid_at is not null))
);

comment on table public.payables is
  'Contas a pagar. As mensais geram a próxima parcela quando a atual é paga.';

create index payables_due_idx on public.payables (organization_id, status, due_date);
create index payables_paid_idx on public.payables (organization_id, paid_at) where paid_at is not null;
create unique index payables_series_due_idx on public.payables (series_id, due_date) where series_id is not null;

create or replace function private.payables_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supplier_id is not null
     and not exists (select 1 from public.suppliers s where s.id = new.supplier_id and s.organization_id = new.organization_id) then
    raise exception 'Fornecedor de outra gráfica.' using errcode = '42501';
  end if;
  if new.category_id is not null
     and not exists (select 1 from public.expense_categories c where c.id = new.category_id and c.organization_id = new.organization_id) then
    raise exception 'Categoria de outra gráfica.' using errcode = '42501';
  end if;
  if new.recurrence = 'mensal' and new.series_id is null then
    new.series_id := new.id;
  end if;
  return new;
end;
$$;

create trigger payables_before_write
  before insert or update on public.payables
  for each row execute function private.payables_before_write();

-- Conta mensal paga: cria a do mês seguinte (uma vez só).
create or replace function private.payables_next_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recurrence = 'mensal' and new.status = 'pago' and old.status is distinct from 'pago' then
    insert into public.payables
      (organization_id, supplier_id, category_id, description, amount, due_date, recurrence, series_id, notes, created_by)
    values
      (new.organization_id, new.supplier_id, new.category_id, new.description, new.amount,
       (new.due_date + interval '1 month')::date, 'mensal', new.series_id, new.notes, (select auth.uid()))
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger payables_next_month
  after update of status on public.payables
  for each row execute function private.payables_next_month();

-- -----------------------------------------------------------------------------
-- Configurações da gráfica (meta mensal e TV)
-- -----------------------------------------------------------------------------
create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  monthly_goal numeric(12, 2) check (monthly_goal is null or monthly_goal >= 0),
  tv_rotation_seconds integer not null default 15 check (tv_rotation_seconds between 5 and 120),
  updated_at timestamptz not null default now()
);

comment on table public.organization_settings is 'Meta de faturamento do mês e ajustes do painel de TV.';

-- -----------------------------------------------------------------------------
-- Dispositivos de TV
-- -----------------------------------------------------------------------------
create table public.tv_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  token text not null unique
    default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_')
    check (char_length(token) >= 32),
  show_financials boolean not null default false,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.tv_devices is 'TVs com acesso só leitura ao painel (/tv/<token>). Revogar desliga na hora.';

-- -----------------------------------------------------------------------------
-- updated_at e auditoria
-- -----------------------------------------------------------------------------
create trigger expense_categories_set_updated_at before update on public.expense_categories
  for each row execute function private.set_updated_at();
create trigger receivables_set_updated_at before update on public.receivables
  for each row execute function private.set_updated_at();
create trigger payables_set_updated_at before update on public.payables
  for each row execute function private.set_updated_at();
create trigger organization_settings_set_updated_at before update on public.organization_settings
  for each row execute function private.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['receivables', 'payables', 'expense_categories', 'tv_devices'] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Relatórios (rodam com a permissão de financeiro: enxergam o custo dos insumos
-- mesmo sem acesso ao estoque)
-- -----------------------------------------------------------------------------

-- DRE simplificado por mês.
create or replace function public.finance_dre(p_org uuid, p_from date, p_to date)
returns table (
  month date,
  gross_revenue numeric,
  fees numeric,
  material_cost numeric,
  expenses numeric,
  result numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.has_any_permission(p_org, 'financeiro.ver', 'relatorios.ver') then
    raise exception 'Sem permissão para ver o financeiro.' using errcode = '42501';
  end if;
  return query
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as m
  ),
  rev as (
    select date_trunc('month', o.confirmed_at at time zone 'America/Sao_Paulo')::date as m,
           sum(o.total) as v, sum(coalesce(r.fee, 0)) as f
    from public.orders o
    left join public.receivables r on r.order_id = o.id
    where o.organization_id = p_org
      and o.status not in ('orcamento', 'cancelado')
      and (o.confirmed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    group by 1
  ),
  extra as (
    select date_trunc('month', r.due_date)::date as m, sum(r.gross) as v, sum(r.fee) as f
    from public.receivables r
    where r.organization_id = p_org and r.order_id is null and r.status <> 'cancelado'
      and r.due_date between p_from and p_to
    group by 1
  ),
  cost as (
    select date_trunc('month', sm.created_at at time zone 'America/Sao_Paulo')::date as m,
           sum(sm.quantity * coalesce(sm.cost_at, 0)) as v
    from public.stock_movements sm
    where sm.organization_id = p_org and sm.type = 'consumo' and sm.material_id is not null
      and (sm.created_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
    group by 1
  ),
  exp as (
    select date_trunc('month', p.due_date)::date as m, sum(p.amount) as v
    from public.payables p
    where p.organization_id = p_org and p.status <> 'cancelado' and p.due_date between p_from and p_to
    group by 1
  )
  select mo.m,
         round(coalesce(rev.v, 0) + coalesce(extra.v, 0), 2),
         round(coalesce(rev.f, 0) + coalesce(extra.f, 0), 2),
         round(coalesce(cost.v, 0), 2),
         round(coalesce(exp.v, 0), 2),
         round(coalesce(rev.v, 0) + coalesce(extra.v, 0) - coalesce(rev.f, 0) - coalesce(extra.f, 0)
               - coalesce(cost.v, 0) - coalesce(exp.v, 0), 2)
  from months mo
  left join rev on rev.m = mo.m
  left join extra on extra.m = mo.m
  left join cost on cost.m = mo.m
  left join exp on exp.m = mo.m
  order by mo.m;
end;
$$;

-- Fluxo de caixa por dia: realizado (recebido/pago) e previsto (em aberto).
create or replace function public.finance_cash_flow(p_org uuid, p_from date, p_to date)
returns table (day date, received numeric, paid numeric, to_receive numeric, to_pay numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.has_any_permission(p_org, 'financeiro.ver', 'relatorios.ver') then
    raise exception 'Sem permissão para ver o financeiro.' using errcode = '42501';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Período longo demais (máximo de 400 dias).' using errcode = '22023';
  end if;
  return query
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
  rec as (
    select r.received_at as d, sum(r.net) as v from public.receivables r
    where r.organization_id = p_org and r.status = 'recebido' and r.received_at between p_from and p_to group by 1
  ),
  pay as (
    select p.paid_at as d, sum(p.amount) as v from public.payables p
    where p.organization_id = p_org and p.status = 'pago' and p.paid_at between p_from and p_to group by 1
  ),
  trec as (
    select r.due_date as d, sum(r.net) as v from public.receivables r
    where r.organization_id = p_org and r.status = 'aberto' and r.due_date between p_from and p_to group by 1
  ),
  tpay as (
    select p.due_date as d, sum(p.amount) as v from public.payables p
    where p.organization_id = p_org and p.status = 'aberto' and p.due_date between p_from and p_to group by 1
  )
  select days.d, coalesce(rec.v, 0), coalesce(pay.v, 0), coalesce(trec.v, 0), coalesce(tpay.v, 0)
  from days
  left join rec on rec.d = days.d
  left join pay on pay.d = days.d
  left join trec on trec.d = days.d
  left join tpay on tpay.d = days.d
  order by days.d;
end;
$$;

-- Margem por produto: receita − custo dos insumos (real ou estimado pela ficha) − taxa (proporcional).
create or replace function public.finance_product_margin(p_org uuid, p_from date, p_to date)
returns table (
  variant_id uuid,
  sku text,
  product_name text,
  variant_name text,
  quantity numeric,
  revenue numeric,
  material_cost numeric,
  fees numeric,
  margin numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.has_any_permission(p_org, 'financeiro.ver', 'relatorios.ver') then
    raise exception 'Sem permissão para ver o financeiro.' using errcode = '42501';
  end if;
  return query
  with items as (
    select i.id, i.variant_id as vid, i.quantity as qty, i.quantity * i.unit_price as rev,
           o.subtotal, coalesce(r.fee, 0) as order_fee
    from public.order_items i
    join public.orders o on o.id = i.order_id
    left join public.receivables r on r.order_id = o.id
    where o.organization_id = p_org
      and o.status not in ('orcamento', 'cancelado')
      and (o.confirmed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and i.variant_id is not null
  ),
  actual as (
    select sm.order_item_id as item, sum(sm.quantity * coalesce(sm.cost_at, 0)) as c
    from public.stock_movements sm
    where sm.organization_id = p_org and sm.type = 'consumo'
      and sm.order_item_id in (select items.id from items)
    group by 1
  ),
  est as (
    select bi.variant_id as vid, sum(bi.quantity * (1 + bi.waste_pct / 100) * m.avg_cost) as unit_cost
    from public.bom_items bi
    join public.materials m on m.id = bi.material_id
    where bi.organization_id = p_org
    group by 1
  ),
  lines as (
    select items.vid, items.qty, items.rev,
           coalesce(actual.c, items.qty * coalesce(est.unit_cost, 0)) as cost,
           case when items.subtotal > 0 then items.order_fee * items.rev / items.subtotal else 0 end as fee
    from items
    left join actual on actual.item = items.id
    left join est on est.vid = items.vid
  )
  select v.id, v.sku, p.name, v.name,
         sum(lines.qty), round(sum(lines.rev), 2), round(sum(lines.cost), 2), round(sum(lines.fee), 2),
         round(sum(lines.rev) - sum(lines.cost) - sum(lines.fee), 2)
  from lines
  join public.product_variants v on v.id = lines.vid
  join public.products p on p.id = v.product_id
  group by v.id, v.sku, p.name, v.name
  order by sum(lines.rev) desc;
end;
$$;

revoke all on function public.finance_dre(uuid, date, date) from public, anon;
revoke all on function public.finance_cash_flow(uuid, date, date) from public, anon;
revoke all on function public.finance_product_margin(uuid, date, date) from public, anon;
grant execute on function public.finance_dre(uuid, date, date) to authenticated;
grant execute on function public.finance_cash_flow(uuid, date, date) to authenticated;
grant execute on function public.finance_product_margin(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Painel de TV (só o servidor chama, depois de receber o token)
-- -----------------------------------------------------------------------------
create or replace function public.tv_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.tv_devices;
  v_org uuid;
  v_fin boolean;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_week date;
  v_month date;
  v_result jsonb;
begin
  update public.tv_devices set last_seen_at = now()
  where token = p_token and revoked_at is null
  returning * into d;
  if d.id is null then
    return null;
  end if;

  v_org := d.organization_id;
  v_fin := d.show_financials;
  v_week := v_today - (extract(isodow from v_today)::integer - 1);
  v_month := date_trunc('month', v_today)::date;

  select jsonb_build_object(
    'organization', (select o.name from public.organizations o where o.id = v_org),
    'device', d.name,
    'today', v_today,
    'show_financials', v_fin,
    'rotation_seconds', coalesce((select s.tv_rotation_seconds from public.organization_settings s where s.organization_id = v_org), 15),
    'monthly_goal', case when v_fin then (select s.monthly_goal from public.organization_settings s where s.organization_id = v_org) end,
    'board', (
      select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb)
      from (
        select o.status, count(*) as n from public.orders o
        where o.organization_id = v_org
          and o.status not in ('orcamento', 'cancelado')
          and (o.status not in ('enviado', 'entregue')
               or (o.status_changed_at at time zone 'America/Sao_Paulo')::date = v_today)
        group by o.status
      ) x
    ),
    'due', (
      select coalesce(jsonb_agg(x.j order by x.due_date, x.number), '[]'::jsonb)
      from (
        select o.due_date, o.number,
               jsonb_build_object('number', o.number, 'customer', o.customer_name, 'due_date', o.due_date,
                                  'status', o.status, 'channel', o.channel) as j
        from public.orders o
        where o.organization_id = v_org and o.status between 'novo' and 'expedicao' and o.due_date <= v_today
        order by o.due_date, o.number
        limit 20
      ) x
    ),
    'art_waiting', (
      select coalesce(jsonb_agg(x.j order by x.since), '[]'::jsonb)
      from (
        select o.status_changed_at as since,
               jsonb_build_object('number', o.number, 'customer', o.customer_name, 'since', o.status_changed_at) as j
        from public.orders o
        where o.organization_id = v_org and o.status = 'aguardando_aprovacao'
        order by o.status_changed_at
        limit 20
      ) x
    ),
    'orders_today', (
      select count(*) from public.orders o
      where o.organization_id = v_org and o.status <> 'cancelado' and o.confirmed_at is not null
        and (o.confirmed_at at time zone 'America/Sao_Paulo')::date = v_today
    ),
    'revenue', case when v_fin then (
      select jsonb_build_object(
        'day', coalesce(sum(x.total) filter (where x.cd = v_today), 0),
        'week', coalesce(sum(x.total) filter (where x.cd >= v_week), 0),
        'month', coalesce(sum(x.total) filter (where x.cd >= v_month), 0)
      )
      from (
        select o.total, (o.confirmed_at at time zone 'America/Sao_Paulo')::date as cd
        from public.orders o
        where o.organization_id = v_org and o.status not in ('orcamento', 'cancelado')
          and o.confirmed_at is not null
      ) x
      where x.cd >= least(v_week, v_month)
    ) end,
    'by_channel', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'channel', x.channel, 'orders', x.n, 'amount', case when v_fin then x.amount end
             ) order by x.n desc), '[]'::jsonb)
      from (
        select o.channel, count(*) as n, sum(o.total) as amount from public.orders o
        where o.organization_id = v_org and o.status not in ('orcamento', 'cancelado')
          and (o.confirmed_at at time zone 'America/Sao_Paulo')::date >= v_month
        group by o.channel
      ) x
    ),
    'critical_stock', (
      select coalesce(jsonb_agg(x.j order by x.ratio), '[]'::jsonb)
      from (
        select ms.available / nullif(ms.min_stock, 0) as ratio,
               jsonb_build_object('name', ms.name, 'unit', ms.unit, 'available', ms.available, 'min', ms.min_stock) as j
        from public.material_stock ms
        where ms.organization_id = v_org and ms.active and ms.below_min
        order by ms.available / nullif(ms.min_stock, 0)
        limit 12
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.tv_snapshot(text) from public, anon, authenticated;
grant execute on function public.tv_snapshot(text) to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.receivables enable row level security;
alter table public.payables enable row level security;
alter table public.organization_settings enable row level security;
alter table public.tv_devices enable row level security;

create policy "Ler categorias de despesa" on public.expense_categories for select to authenticated
  using ((select private.has_any_permission(organization_id, 'financeiro.ver', 'relatorios.ver')));
create policy "Cadastrar categorias de despesa" on public.expense_categories for insert to authenticated
  with check ((select private.has_permission(organization_id, 'financeiro.gerenciar')));
create policy "Editar categorias de despesa" on public.expense_categories for update to authenticated
  using ((select private.has_permission(organization_id, 'financeiro.gerenciar')))
  with check ((select private.has_permission(organization_id, 'financeiro.gerenciar')));

create policy "Ler contas a receber" on public.receivables for select to authenticated
  using ((select private.has_any_permission(organization_id, 'financeiro.ver', 'relatorios.ver')));
create policy "Lançar contas a receber avulsas" on public.receivables for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'financeiro.gerenciar'))
    and order_id is null
    and created_by = (select auth.uid())
  );
create policy "Editar contas a receber" on public.receivables for update to authenticated
  using ((select private.has_permission(organization_id, 'financeiro.gerenciar')))
  with check ((select private.has_permission(organization_id, 'financeiro.gerenciar')));

create policy "Ler contas a pagar" on public.payables for select to authenticated
  using ((select private.has_any_permission(organization_id, 'financeiro.ver', 'relatorios.ver')));
create policy "Lançar contas a pagar" on public.payables for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'financeiro.gerenciar'))
    and created_by = (select auth.uid())
  );
create policy "Editar contas a pagar" on public.payables for update to authenticated
  using ((select private.has_permission(organization_id, 'financeiro.gerenciar')))
  with check ((select private.has_permission(organization_id, 'financeiro.gerenciar')));

create policy "Ler configurações da gráfica" on public.organization_settings for select to authenticated
  using ((select private.has_any_permission(organization_id, 'financeiro.ver', 'configuracoes.ver')));
create policy "Criar configurações da gráfica" on public.organization_settings for insert to authenticated
  with check ((select private.has_any_permission(organization_id, 'financeiro.gerenciar', 'configuracoes.gerenciar')));
create policy "Editar configurações da gráfica" on public.organization_settings for update to authenticated
  using ((select private.has_any_permission(organization_id, 'financeiro.gerenciar', 'configuracoes.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'financeiro.gerenciar', 'configuracoes.gerenciar')));

create policy "Ler dispositivos de TV" on public.tv_devices for select to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));
create policy "Cadastrar dispositivos de TV" on public.tv_devices for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'configuracoes.gerenciar'))
    and created_by = (select auth.uid())
  );
create policy "Editar dispositivos de TV" on public.tv_devices for update to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.gerenciar')))
  with check ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));

revoke all on public.expense_categories, public.receivables, public.payables,
  public.organization_settings, public.tv_devices from anon;

-- Exclusão não existe: cancela-se (histórico financeiro) ou revoga-se (TV).
revoke delete on public.receivables, public.payables, public.tv_devices, public.organization_settings from authenticated;

revoke update on public.receivables from authenticated;
grant update (description, customer_name, gross, fee, due_date, received_at, status, notes) on public.receivables to authenticated;

revoke update on public.payables from authenticated;
grant update (supplier_id, category_id, description, amount, due_date, paid_at, status, recurrence, notes)
  on public.payables to authenticated;

revoke update on public.tv_devices from authenticated;
grant update (name, show_financials, revoked_at) on public.tv_devices to authenticated;

-- confirmed_at e cost_at ficam fora das colunas liberadas: só os gatilhos gravam.

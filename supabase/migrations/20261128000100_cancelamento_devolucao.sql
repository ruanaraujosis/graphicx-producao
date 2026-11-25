-- =============================================================================
-- Fase 9.4 — Cancelamento e devolução de vendas concluídas
--   * Permissão própria pedidos.cancelar (só o Administrador começa com ela).
--   * A pessoa confirma a própria senha no servidor antes (a senha não é guardada).
--   * Cancelamento: motivo obrigatório; devolve ao estoque o que ainda não voltou,
--     cancela o a receber em aberto ou lança o estorno a pagar se já foi recebido.
--   * Devolução total ou parcial: itens e quantidades, entrada no estoque e estorno
--     proporcional (com o desconto da venda). Idempotente pela chave enviada.
--   * Produto sob encomenda (ficha técnica) não volta ao estoque: os insumos já
--     foram consumidos na produção.
--   * Tudo fica no histórico do pedido, que não aceita exclusão de ocorrências.
-- =============================================================================

create or replace function private.valid_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'pedidos.ver', 'pedidos.gerenciar', 'pedidos.alterar_preco', 'pedidos.cancelar',
    'vendas.ver', 'vendas.gerenciar', 'vendas.autorizar',
    'artes.ver', 'artes.gerenciar',
    'pcp.ver', 'pcp.gerenciar',
    'estoque.ver', 'estoque.gerenciar',
    'expedicao.ver', 'expedicao.gerenciar',
    'cadastros.ver', 'cadastros.gerenciar',
    'lgpd.gerenciar',
    'financeiro.ver', 'financeiro.gerenciar',
    'nfe.ver', 'nfe.gerenciar',
    'marketing.ver', 'marketing.gerenciar',
    'relatorios.ver',
    'equipe.ver', 'equipe.gerenciar',
    'configuracoes.ver', 'configuracoes.gerenciar'
  ]::text[]
$$;

-- -----------------------------------------------------------------------------
-- Devoluções
-- -----------------------------------------------------------------------------
create table public.order_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('devolucao', 'cancelamento')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  refund_amount numeric(12, 2) not null check (refund_amount >= 0),
  refund_via text not null check (refund_via in ('a_receber', 'a_pagar', 'nenhum')),
  idempotency_key uuid not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

comment on table public.order_returns is
  'Devoluções e cancelamentos de vendas concluídas. Só as funções return_sale/cancel_sale gravam.';
comment on column public.order_returns.refund_via is
  'a_receber: abateu do a receber em aberto; a_pagar: lançou estorno a pagar; nenhum: sem valor.';

create index order_returns_order_idx on public.order_returns (order_id, created_at);

create table public.order_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  return_id uuid not null references public.order_returns (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  quantity numeric(12, 3) not null check (quantity > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  restocked boolean not null default false
);

comment on table public.order_return_items is 'Itens e quantidades de cada devolução (restocked: voltou ao estoque).';

create index order_return_items_return_idx on public.order_return_items (return_id);
create index order_return_items_item_idx on public.order_return_items (order_item_id);

create trigger order_returns_audit after insert or update or delete on public.order_returns
  for each row execute function private.audit_row_change();

alter table public.order_returns enable row level security;
alter table public.order_return_items enable row level security;
create policy "Ler devoluções" on public.order_returns for select to authenticated
  using ((select private.has_permission(organization_id, 'pedidos.ver'))
      or (select private.has_permission(organization_id, 'vendas.ver')));
create policy "Ler itens devolvidos" on public.order_return_items for select to authenticated
  using ((select private.has_permission(organization_id, 'pedidos.ver'))
      or (select private.has_permission(organization_id, 'vendas.ver')));
-- Sem insert/update/delete para a equipe: só as funções abaixo gravam.
revoke all on public.order_returns, public.order_return_items from anon;

-- O histórico do pedido não aceita exclusão de ocorrências (só cai junto com o pedido).
create or replace function private.order_events_no_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.id = old.order_id) then
    raise exception 'O histórico do pedido não pode ser apagado.' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger order_events_no_delete
  before delete on public.order_events
  for each row execute function private.order_events_no_delete();

-- -----------------------------------------------------------------------------
-- Estorno no financeiro
-- -----------------------------------------------------------------------------

-- O valor do a receber de pedido continua acompanhando o pedido; a única exceção
-- é o estorno de uma devolução (app.sale_reversal ligado pela função abaixo).
create or replace function private.receivables_guard()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if pg_trigger_depth() = 1 and (select auth.uid()) is not null then
    if new.order_id is distinct from old.order_id then
      raise exception 'Não é possível trocar o pedido da conta.' using errcode = '42501';
    end if;
    if old.order_id is not null and new.gross is distinct from old.gross
       and coalesce(current_setting('app.sale_reversal', true), '') <> 'on' then
      raise exception 'O valor da conta de um pedido acompanha o pedido. Edite o pedido.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$;

create or replace function private.sale_refund(p_order uuid, p_amount numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  r public.receivables;
  v_left numeric;
begin
  if p_amount <= 0 then
    return 'nenhum';
  end if;
  select id, organization_id, number into o from public.orders where id = p_order;
  select * into r from public.receivables where order_id = p_order for update;

  if r.id is not null and r.status = 'aberto' and r.gross >= p_amount then
    v_left := r.gross - p_amount;
    perform set_config('app.sale_reversal', 'on', true);
    update public.receivables
       set gross = v_left,
           fee = least(fee, v_left),
           status = case when v_left = 0 then 'cancelado' else status end
     where id = r.id;
    perform set_config('app.sale_reversal', '', true);
    return 'a_receber';
  end if;

  -- Já recebido (ou sem a receber): o valor volta ao cliente por uma conta a pagar.
  insert into public.payables (organization_id, description, amount, due_date, notes)
  values (o.organization_id, 'Estorno da venda #' || o.number, p_amount,
          (now() at time zone 'America/Sao_Paulo')::date,
          'Lançado pela devolução/cancelamento da venda.');
  return 'a_pagar';
end;
$$;

revoke all on function private.sale_refund(uuid, numeric) from public;

-- Quanto de cada item já voltou.
create or replace function private.item_returned(p_item uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(quantity), 0) from public.order_return_items where order_item_id = p_item
$$;

revoke all on function private.item_returned(uuid) from public;
grant execute on function private.item_returned(uuid) to authenticated;

-- Registra a devolução de itens (estoque e itens). O financeiro fica com quem chama.
create or replace function private.register_return(
  p_order public.orders,
  p_kind text,
  p_reason text,
  p_items jsonb,
  p_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return uuid;
  v_item jsonb;
  oi record;
  v_qty numeric;
  v_amount numeric;
  v_total numeric := 0;
  v_factor numeric := case when p_order.subtotal > 0 then p_order.total / p_order.subtotal else 0 end;
  v_ready boolean;
begin
  insert into public.order_returns (organization_id, order_id, kind, reason, refund_amount, refund_via, idempotency_key)
  values (p_order.organization_id, p_order.id, p_kind, btrim(p_reason), 0, 'nenhum', p_key)
  returning id into v_return;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select i.id, i.variant_id, i.quantity, i.unit_price, i.organization_id
      into oi from public.order_items i
     where i.id = nullif(v_item ->> 'order_item_id', '')::uuid and i.order_id = p_order.id;
    if oi.id is null then
      raise exception 'Item não é desta venda.' using errcode = '22023';
    end if;
    v_qty := round(nullif(v_item ->> 'quantity', '')::numeric, 3);
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;
    if v_qty > oi.quantity - private.item_returned(oi.id) then
      raise exception 'A quantidade devolvida passa do que foi vendido.' using errcode = '22023';
    end if;
    v_amount := round(v_qty * oi.unit_price * v_factor, 2);
    v_total := v_total + v_amount;

    v_ready := false;
    if oi.variant_id is not null then
      select p.fulfillment = 'pronta_entrega' into v_ready
        from public.product_variants v join public.products p on p.id = v.product_id
       where v.id = oi.variant_id;
    end if;
    if coalesce(v_ready, false) then
      insert into public.stock_movements
        (organization_id, variant_id, type, quantity, reason, reference, order_item_id, created_by)
      values (oi.organization_id, oi.variant_id, 'entrada', v_qty,
              'Devolução da venda', 'Pedido #' || p_order.number, oi.id, auth.uid());
    end if;
    insert into public.order_return_items (organization_id, return_id, order_item_id, quantity, amount, restocked)
    values (oi.organization_id, v_return, oi.id, v_qty, v_amount, coalesce(v_ready, false));
  end loop;

  if p_kind = 'devolucao' and not exists (select 1 from public.order_return_items where return_id = v_return) then
    raise exception 'Informe a quantidade de pelo menos um item.' using errcode = '22023';
  end if;

  -- O total estornado nunca passa do valor da venda (arredondamentos).
  v_total := least(v_total, p_order.total - coalesce((
    select sum(refund_amount) from public.order_returns where order_id = p_order.id and id <> v_return), 0));
  update public.order_returns set refund_amount = greatest(v_total, 0) where id = v_return;
  return v_return;
end;
$$;

revoke all on function private.register_return(public.orders, text, text, jsonb, uuid) from public;

-- -----------------------------------------------------------------------------
-- Devolução total ou parcial
-- -----------------------------------------------------------------------------
create or replace function public.return_sale(p_order uuid, p_items jsonb, p_reason text, p_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_return uuid;
  v_amount numeric;
  v_via text;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not private.has_permission(o.organization_id, 'pedidos.cancelar') then
    raise exception 'Sem permissão para devolver esta venda.' using errcode = '42501';
  end if;
  if p_key is null then
    raise exception 'Falta a chave da operação.' using errcode = '22023';
  end if;
  -- Mesma chave = mesma devolução: não aplica duas vezes.
  select id into v_return from public.order_returns
   where organization_id = o.organization_id and idempotency_key = p_key;
  if v_return is not null then
    return v_return;
  end if;
  if o.kind <> 'venda' or o.status <> 'vendido' then
    raise exception 'Só venda concluída pode ser devolvida.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo da devolução.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Informe a quantidade de pelo menos um item.' using errcode = '22023';
  end if;

  v_return := private.register_return(o, 'devolucao', p_reason, p_items, p_key);
  select refund_amount into v_amount from public.order_returns where id = v_return;
  v_via := private.sale_refund(o.id, v_amount);
  update public.order_returns set refund_via = v_via where id = v_return;

  insert into public.order_events (organization_id, order_id, type, message)
  values (o.organization_id, o.id, 'devolucao',
          left(format('Devolução de %s (R$ %s). Motivo: %s',
                 (select string_agg(format('%s × %s', ri.quantity::text, i.description), ', ')
                    from public.order_return_items ri join public.order_items i on i.id = ri.order_item_id
                   where ri.return_id = v_return),
                 replace(to_char(v_amount, 'FM999999990D00'), '.', ','),
                 btrim(p_reason)), 2000));
  return v_return;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelamento da venda concluída
-- -----------------------------------------------------------------------------
create or replace function public.cancel_sale(p_order uuid, p_reason text, p_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_return uuid;
  v_items jsonb;
  v_amount numeric;
  r public.receivables;
  v_via text := 'nenhum';
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not private.has_permission(o.organization_id, 'pedidos.cancelar') then
    raise exception 'Sem permissão para cancelar esta venda.' using errcode = '42501';
  end if;
  if p_key is null then
    raise exception 'Falta a chave da operação.' using errcode = '22023';
  end if;
  select id into v_return from public.order_returns
   where organization_id = o.organization_id and idempotency_key = p_key;
  if v_return is not null then
    return v_return;
  end if;
  if o.kind <> 'venda' or o.status <> 'vendido' then
    raise exception 'Só venda concluída pode ser cancelada aqui.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
  end if;

  -- Tudo o que ainda não voltou volta agora.
  select coalesce(jsonb_agg(jsonb_build_object('order_item_id', i.id,
           'quantity', i.quantity - private.item_returned(i.id))), '[]'::jsonb)
    into v_items
    from public.order_items i
   where i.order_id = o.id and i.quantity - private.item_returned(i.id) > 0;

  v_return := private.register_return(o, 'cancelamento', p_reason, v_items, p_key);
  select refund_amount into v_amount from public.order_returns where id = v_return;

  -- A receber em aberto é cancelado pela troca de status; já recebido vira estorno a pagar.
  select * into r from public.receivables where order_id = o.id;
  if v_amount > 0 then
    if r.id is not null and r.status = 'aberto' then
      v_via := 'a_receber';
    else
      v_via := private.sale_refund(o.id, v_amount);
    end if;
  end if;
  update public.order_returns set refund_via = v_via where id = v_return;

  perform set_config('app.sale_reversal', 'on', true);
  perform set_config('app.status_note', btrim(p_reason), true);
  update public.orders set status = 'cancelado', cancel_reason = left(btrim(p_reason), 500) where id = o.id;
  perform set_config('app.sale_reversal', '', true);
  return v_return;
end;
$$;

revoke all on function public.return_sale(uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.cancel_sale(uuid, text, uuid) from public, anon;
grant execute on function public.return_sale(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.cancel_sale(uuid, text, uuid) to authenticated;

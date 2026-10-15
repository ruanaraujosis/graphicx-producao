-- =============================================================================
-- Fase 5 (etapa 2) — Pedidos dos marketplaces
--   Entrada/atualização idempotente do pedido (por loja + número externo),
--   itens ligados ao cadastro pelo vínculo do anúncio ou pelo SKU, prazo de
--   postagem, status que só avança e a taxa real do marketplace na conta a
--   receber. A tradução do formato de cada marketplace fica no servidor (TS).
-- =============================================================================

alter table public.orders
  add column channel_fee numeric(12, 2) check (channel_fee is null or channel_fee >= 0);

comment on column public.orders.channel_fee is
  'Taxas reais cobradas pelo marketplace (comissão, serviço, frete). Nulo = usa a taxa da forma de pagamento.';

alter table public.marketplace_shops
  add column orders_synced_until timestamptz;

comment on column public.marketplace_shops.orders_synced_until is
  'Até quando os pedidos já foram conferidos na rotina de reconciliação.';

-- -----------------------------------------------------------------------------
-- Conta a receber: usa a taxa real do marketplace quando houver.
-- (Mesma função da Fase 4; muda só o cálculo de v_fee.)
-- -----------------------------------------------------------------------------
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
  select id, organization_id, number, status, total, customer_name, channel, payment_method_id, confirmed_at, channel_fee
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
  v_fee := least(coalesce(o.channel_fee, round(o.total * coalesce(v_fee_pct, 0) / 100, 2)), o.total);

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
        fee = v_fee,
        customer_name = o.customer_name,
        channel = o.channel,
        payment_method_id = o.payment_method_id,
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

drop trigger orders_sync_receivable on public.orders;
create trigger orders_sync_receivable
  after insert or update of status, total, payment_method_id, customer_name, channel, channel_fee on public.orders
  for each row execute function private.orders_sync_receivable();

-- -----------------------------------------------------------------------------
-- Entrada do pedido (só o servidor, depois de conferir a origem)
--
-- p_order (formato neutro, montado pelo servidor):
--   external_id, external_status, target_status (order_status ou nulo = ainda
--   não pago: não cria), customer_name, ship_by_at, package_number, notes,
--   cancel_reason, fee (nulo = mantém), items: [{external_item_id,
--   external_model_id, sku, description, quantity, unit_price}]
--
-- Regras:
--   - novo pedido entra como "novo" (a produção segue o fluxo da GraphicX);
--   - depois disso, o marketplace só avança para enviado/entregue ou cancela;
--     nunca volta o status que a equipe definiu.
-- Retorna o id do pedido (nulo quando não criou).
-- -----------------------------------------------------------------------------
create or replace function public.marketplace_upsert_order(p_shop uuid, p_order jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.marketplace_shops;
  v_channel public.sales_channel;
  v_ext text := nullif(btrim(p_order ->> 'external_id'), '');
  v_target public.order_status := nullif(p_order ->> 'target_status', '')::public.order_status;
  v_ship_by timestamptz := nullif(p_order ->> 'ship_by_at', '')::timestamptz;
  v_reason text := left(nullif(btrim(coalesce(p_order ->> 'cancel_reason', '')), ''), 500);
  o public.orders;
  v_item jsonb;
  v_variant uuid;
  v_pos smallint := 0;
  v_label text;
begin
  select * into s from public.marketplace_shops where id = p_shop;
  if s.id is null then
    raise exception 'Loja não encontrada.' using errcode = 'P0002';
  end if;
  if v_ext is null then
    raise exception 'Pedido sem número.' using errcode = '22023';
  end if;
  v_channel := s.marketplace::text::public.sales_channel;
  v_label := initcap(s.marketplace::text);
  perform set_config('app.actor_label', v_label, true);

  select * into o from public.orders
  where organization_id = s.organization_id and channel = v_channel and external_id = v_ext
  for update;

  if o.id is null then
    if v_target is null then
      return null; -- ainda não pago: entra quando o pagamento for confirmado
    end if;
    if jsonb_typeof(p_order -> 'items') is distinct from 'array' or jsonb_array_length(p_order -> 'items') = 0 then
      raise exception 'Pedido sem itens.' using errcode = '22023';
    end if;

    insert into public.orders
      (organization_id, channel, status, customer_name, needs_art, due_date, notes,
       external_id, external_status, shop_id, ship_by_at, package_number, channel_fee, created_by)
    values
      (s.organization_id, v_channel, 'novo',
       coalesce(nullif(left(btrim(coalesce(p_order ->> 'customer_name', '')), 160), ''), 'Comprador ' || v_label),
       true,
       (v_ship_by at time zone 'America/Sao_Paulo')::date,
       left(nullif(btrim(coalesce(p_order ->> 'notes', '')), ''), 2000),
       v_ext, left(p_order ->> 'external_status', 40), s.id, v_ship_by,
       left(nullif(p_order ->> 'package_number', ''), 60),
       nullif(p_order ->> 'fee', '')::numeric, null)
    returning * into o;

    for v_item in select value from jsonb_array_elements(p_order -> 'items') loop
      v_pos := v_pos + 1;
      -- 1º o vínculo do anúncio; 2º o SKU igual ao do cadastro.
      select l.variant_id into v_variant
      from public.marketplace_listings l
      where l.shop_id = s.id
        and l.external_item_id = v_item ->> 'external_item_id'
        and l.external_model_id = coalesce(v_item ->> 'external_model_id', '')
        and l.variant_id is not null;
      if v_variant is null and nullif(btrim(coalesce(v_item ->> 'sku', '')), '') is not null then
        select v.id into v_variant
        from public.product_variants v
        where v.organization_id = s.organization_id and upper(v.sku) = upper(btrim(v_item ->> 'sku'));
      end if;

      insert into public.order_items
        (organization_id, order_id, variant_id, description, quantity, unit_price, position)
      values
        (s.organization_id, o.id, v_variant,
         left(coalesce(nullif(btrim(coalesce(v_item ->> 'description', '')), ''), 'Item ' || v_label), 300),
         greatest((v_item ->> 'quantity')::numeric, 1),
         greatest(coalesce((v_item ->> 'unit_price')::numeric, 0), 0),
         v_pos);
      v_variant := null;
    end loop;

    select * into o from public.orders where id = o.id;
  else
    update public.orders
    set external_status = coalesce(left(p_order ->> 'external_status', 40), external_status),
        ship_by_at = coalesce(v_ship_by, ship_by_at),
        due_date = coalesce((v_ship_by at time zone 'America/Sao_Paulo')::date, due_date),
        package_number = coalesce(left(nullif(p_order ->> 'package_number', ''), 60), package_number),
        channel_fee = coalesce(nullif(p_order ->> 'fee', '')::numeric, channel_fee),
        shop_id = coalesce(shop_id, s.id)
    where id = o.id;
  end if;

  -- Status vindo do marketplace: só avança (enviado/entregue) ou cancela.
  if v_target = 'cancelado' and o.status not in ('cancelado', 'entregue') then
    perform set_config('app.status_note', coalesce(v_reason, 'Cancelado no marketplace.'), true);
    update public.orders
    set status = 'cancelado', cancel_reason = coalesce(v_reason, 'Cancelado no marketplace.')
    where id = o.id;
  elsif v_target in ('enviado', 'entregue') and o.status < v_target and o.status <> 'cancelado' then
    perform set_config('app.status_note', 'Atualizado pelo marketplace.', true);
    update public.orders set status = v_target where id = o.id;
  end if;

  perform set_config('app.actor_label', '', true);
  return o.id;
end;
$$;

revoke all on function public.marketplace_upsert_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.marketplace_upsert_order(uuid, jsonb) to service_role;

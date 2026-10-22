-- =============================================================================
-- Fase 5 (etapa 6) — Mensagem automática no chat da Shopee
--   Guarda o comprador (para enviar a mensagem) e quando ela foi enviada; o
--   pedido novo põe a mensagem na fila quando a loja ligou a opção.
-- =============================================================================

alter table public.orders
  add column external_buyer_id text check (external_buyer_id is null or char_length(external_buyer_id) <= 40),
  add column chat_sent_at timestamptz;

comment on column public.orders.external_buyer_id is 'Id do comprador no marketplace (para o chat).';
comment on column public.orders.chat_sent_at is 'Quando a mensagem automática foi enviada ao comprador.';

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
       external_id, external_status, shop_id, ship_by_at, package_number, channel_fee, external_buyer_id, created_by)
    values
      (s.organization_id, v_channel, 'novo',
       coalesce(nullif(left(btrim(coalesce(p_order ->> 'customer_name', '')), 160), ''), 'Comprador ' || v_label),
       true,
       (v_ship_by at time zone 'America/Sao_Paulo')::date,
       left(nullif(btrim(coalesce(p_order ->> 'notes', '')), ''), 2000),
       v_ext, left(p_order ->> 'external_status', 40), s.id, v_ship_by,
       left(nullif(p_order ->> 'package_number', ''), 60),
       nullif(p_order ->> 'fee', '')::numeric,
       left(nullif(p_order ->> 'buyer_id', ''), 40), null)
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

    -- Os itens mudam o total depois da inclusão: acerta a conta a receber.
    perform private.sync_order_receivable(o.id);

    -- Mensagem automática no chat (link para enviar a arte), se a loja ligou.
    if s.chat_message_enabled and v_target = 'novo' then
      perform public.marketplace_enqueue(s.id, 'chat.welcome', jsonb_build_object('order_id', o.id), 'chat:' || o.id);
    end if;
    select * into o from public.orders where id = o.id;
  else
    update public.orders
    set external_status = coalesce(left(p_order ->> 'external_status', 40), external_status),
        ship_by_at = coalesce(v_ship_by, ship_by_at),
        due_date = coalesce((v_ship_by at time zone 'America/Sao_Paulo')::date, due_date),
        package_number = coalesce(left(nullif(p_order ->> 'package_number', ''), 60), package_number),
        channel_fee = coalesce(nullif(p_order ->> 'fee', '')::numeric, channel_fee),
        shop_id = coalesce(shop_id, s.id),
        external_buyer_id = coalesce(external_buyer_id, left(nullif(p_order ->> 'buyer_id', ''), 40))
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

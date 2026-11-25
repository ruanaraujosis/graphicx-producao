-- =============================================================================
-- Fase 9.3 — Documento do pedido de venda
--   Descrição complementar por item, impressa no documento de conferência e
--   assinatura. Na venda concluída ela também fica travada.
-- =============================================================================

alter table public.order_items
  add column if not exists complement text check (complement is null or char_length(complement) <= 500);
comment on column public.order_items.complement is 'Descrição complementar do item (impressa no pedido de venda).';

create or replace function private.order_items_sale_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders o
     where o.id = coalesce(new.order_id, old.order_id) and o.status = 'vendido'
  ) and coalesce(current_setting('app.sale_reversal', true), '') <> 'on' then
    if tg_op = 'UPDATE'
       and (new.variant_id, new.description, new.complement, new.quantity, new.unit_price, new.order_id)
           is not distinct from (old.variant_id, old.description, old.complement, old.quantity, old.unit_price, old.order_id) then
      return new;
    end if;
    raise exception 'Venda concluída não pode ser editada; use cancelar ou devolver.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.create_sale(
  p_org uuid,
  p_fields jsonb,
  p_items jsonb,
  p_paid boolean default true,
  p_authorization uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.sales_settings;
  v_channel public.sales_channel;
  v_seller uuid;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_variant uuid;
  v_price numeric;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_percent numeric := 0;
  v_auth public.discount_authorizations;
  v_customer uuid;
  v_id uuid;
begin
  if not (private.has_permission(p_org, 'pedidos.gerenciar') or private.has_permission(p_org, 'vendas.gerenciar')) then
    raise exception 'Sem permissão para lançar vendas.' using errcode = '42501';
  end if;

  v_settings := private.sales_settings_for(p_org);
  v_channel := coalesce((p_fields ->> 'channel')::public.sales_channel, 'balcao');
  if v_channel not in ('balcao', 'whatsapp') then
    raise exception 'Pedido de venda é para balcão ou WhatsApp.' using errcode = '22023';
  end if;
  if v_settings.require_payment_method and nullif(p_fields ->> 'payment_method_id', '') is null then
    raise exception 'Informe a forma de pagamento.' using errcode = '22023';
  end if;

  -- Vendedor: quem lança, ou outra pessoa da equipe escolhida na venda.
  v_seller := coalesce(nullif(p_fields ->> 'seller_id', '')::uuid, auth.uid());

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Inclua pelo menos um produto.' using errcode = '22023';
  end if;

  -- Preço do cadastro, recalculado aqui. Só produto com ficha técnica aceita outro
  -- preço, e só com pedidos.alterar_preco.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    if v_variant is null
       or not exists (select 1 from public.product_variants pv
                       where pv.id = v_variant and pv.organization_id = p_org) then
      raise exception 'Produto não encontrado no cadastro.' using errcode = '22023';
    end if;
    v_price := public.variant_price(v_variant, v_channel);
    if nullif(v_item ->> 'unit_price', '') is not null
       and round((v_item ->> 'unit_price')::numeric, 2) <> round(v_price, 2) then
      if not private.has_bom(v_variant) then
        raise exception 'O preço deste produto vem do cadastro.' using errcode = '42501';
      end if;
      perform private.check_item_price(p_org, v_variant, v_channel, (v_item ->> 'unit_price')::numeric);
      v_price := round((v_item ->> 'unit_price')::numeric, 2);
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', '',
      'variant_id', v_variant,
      'description', v_item ->> 'description',
      'quantity', (v_item ->> 'quantity')::numeric,
      'unit_price', v_price
    ));
    v_subtotal := v_subtotal + round((v_item ->> 'quantity')::numeric * v_price, 2);
  end loop;

  -- Desconto em dois níveis.
  v_discount := round(coalesce((p_fields ->> 'discount')::numeric, 0), 2);
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'O desconto é maior que o total.' using errcode = '22023';
  end if;
  if v_discount > 0 then
    if not private.has_permission(p_org, 'vendas.gerenciar') then
      raise exception 'Só quem tem a permissão de vendedor dá desconto.' using errcode = '42501';
    end if;
    v_percent := round(v_discount * 100 / v_subtotal, 2);
    if v_percent > v_settings.seller_max_discount then
      if v_percent > v_settings.manager_max_discount then
        raise exception '%', format('Desconto de %s%% passa do limite de %s%% da gráfica.',
          v_percent, v_settings.manager_max_discount) using errcode = '42501';
      end if;
      select * into v_auth from public.discount_authorizations
       where id = p_authorization and organization_id = p_org
       for update;
      if v_auth.id is null or v_auth.used_at is not null or v_auth.expires_at < now()
         or v_auth.max_percent < v_percent then
        raise exception '%', format('Desconto acima de %s%% precisa da liberação de um gerente.',
          v_settings.seller_max_discount) using errcode = '42501';
      end if;
      -- O gerente ainda precisa ter a permissão no momento do uso.
      if not exists (
        select 1 from public.organization_members m
          join public.organization_roles r on r.id = m.role_id
         where m.organization_id = p_org and m.user_id = v_auth.authorized_by and m.active
           and (r.is_admin or 'vendas.autorizar' = any (r.permissions))
      ) then
        raise exception 'A liberação não vale mais. Peça de novo ao gerente.' using errcode = '42501';
      end if;
    end if;
  end if;

  v_customer := nullif(p_fields ->> 'customer_id', '')::uuid;

  -- Mesmo caminho do pedido comum (itens, totais, reserva), sem arte.
  v_id := public.create_order(
    p_org, 'novo',
    (p_fields - 'seller_id') || jsonb_build_object('needs_art', false, 'channel', v_channel,
      'discount', v_discount, 'shipping', 0,
      'notes', coalesce(nullif(p_fields ->> 'notes', ''), v_settings.default_note)),
    v_items);

  -- Descrição complementar de cada item (sai na impressão), na mesma ordem enviada.
  update public.order_items i
     set complement = left(nullif(btrim(x.value ->> 'complement'), ''), 500)
    from jsonb_array_elements(p_items) with ordinality as x (value, pos)
   where i.order_id = v_id and i.position = x.pos
     and nullif(btrim(x.value ->> 'complement'), '') is not null;

  update public.orders
     set kind = 'venda',
         seller_id = v_seller,
         discount_percent = v_percent,
         discount_authorized_by = v_auth.authorized_by,
         discount_authorized_at = case when v_auth.id is not null then now() end,
         first_purchase = v_settings.tag_first_purchase and v_customer is not null
           and not exists (select 1 from public.orders o
                            where o.customer_id = v_customer and o.id <> v_id
                              and o.status not in ('orcamento', 'cancelado'))
   where id = v_id;

  if v_auth.id is not null then
    update public.discount_authorizations set used_at = now(), order_id = v_id where id = v_auth.id;
    insert into public.order_events (organization_id, order_id, type, message, actor_id)
    values (p_org, v_id, 'desconto_autorizado',
            format('Desconto de %s%% liberado por %s.', v_percent,
                   coalesce((select full_name from public.profiles where id = v_auth.authorized_by), 'gerente')),
            v_auth.authorized_by);
  end if;

  -- Vendido na hora: baixa o estoque (pronto ou insumos da ficha). Daqui em diante a
  -- venda não é editada nem apagada; só cancelada ou devolvida (Fase 9.4).
  perform set_config('app.status_note', 'Pedido de venda concluído.', true);
  update public.orders set status = 'vendido' where id = v_id;

  if p_paid then
    update public.receivables
    set status = 'recebido',
        received_at = (now() at time zone 'America/Sao_Paulo')::date
    where order_id = v_id and status = 'aberto';
  end if;
  return v_id;
end;
$$;

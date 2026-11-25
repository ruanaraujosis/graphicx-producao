-- =============================================================================
-- Fase 9.1 — Pedido de venda
--   A venda rápida vira "pedido de venda" (orders.kind = 'venda'): vendedor,
--   desconto em dois níveis (vendedor até o limite dele; acima, liberação de um
--   gerente com vendas.autorizar, de uso único) e configurações por gráfica.
--   Preço vem sempre do cadastro (public.variant_price); trocar o preço de
--   produto com ficha técnica exige pedidos.alterar_preco (vendas e pedidos).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissões (manter igual a src/lib/auth/permissions.ts)
-- -----------------------------------------------------------------------------
create or replace function private.valid_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'pedidos.ver', 'pedidos.gerenciar', 'pedidos.alterar_preco',
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

-- Decisão de 2026-11-25: quem já gerencia pedidos vira vendedor (dá desconto até
-- o limite). Liberar desconto acima do limite e trocar preço ficam só com o
-- Administrador até a gráfica conceder a outros perfis.
update public.organization_roles
   set permissions = array_append(permissions, 'vendas.gerenciar')
 where not is_admin
   and 'pedidos.gerenciar' = any (permissions)
   and not ('vendas.gerenciar' = any (permissions));

create or replace function private.seed_default_roles(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_roles (organization_id, name, description, permissions, is_admin, require_mfa)
  values
    (org, 'Administrador', 'Acesso total à gráfica, equipe, perfis e configurações.',
      private.valid_permissions(), true, true),
    (org, 'Atendimento', 'Pedidos, vendas, clientes, orçamentos e artes.',
      array['pedidos.gerenciar', 'vendas.gerenciar', 'artes.gerenciar', 'cadastros.gerenciar',
            'pcp.ver', 'estoque.ver', 'expedicao.ver'],
      false, false),
    (org, 'Designer', 'Fila de artes, upload de provas e histórico de versões.',
      array['artes.gerenciar', 'pedidos.ver', 'pcp.ver'], false, false),
    (org, 'Produção', 'Painel PCP, apontamento de etapas e consumo de insumos.',
      array['pcp.gerenciar', 'estoque.gerenciar', 'pedidos.ver'], false, false),
    (org, 'Expedição', 'Separação, etiquetas, despacho e rastreio.',
      array['expedicao.gerenciar', 'pedidos.ver', 'pcp.ver'], false, false),
    (org, 'Financeiro', 'Contas a receber e a pagar, NF-e e relatórios.',
      array['financeiro.gerenciar', 'nfe.gerenciar', 'relatorios.ver', 'pedidos.ver'], false, true)
  on conflict do nothing;
end;
$$;

revoke all on function private.seed_default_roles(uuid) from public;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.order_kind as enum ('producao', 'venda');
comment on type public.order_kind is 'producao: passa pelo PCP; venda: pedido de venda (balcão/WhatsApp).';

-- Valor novo de enum não pode ser removido depois (aceito: só registra a liberação).
alter type public.order_event_type add value if not exists 'desconto_autorizado';

-- -----------------------------------------------------------------------------
-- Pedidos: colunas da venda
-- -----------------------------------------------------------------------------
alter table public.orders
  add column kind public.order_kind not null default 'producao',
  add column seller_id uuid references public.profiles (id) on delete set null,
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent between 0 and 100),
  add column discount_authorized_by uuid references auth.users (id) on delete set null,
  add column discount_authorized_at timestamptz,
  add column first_purchase boolean not null default false;

comment on column public.orders.kind is 'Venda ou pedido de produção. Vendas antigas (venda rápida) continuam producao.';
comment on column public.orders.seller_id is 'Vendedor do ranking e da comissão (padrão: quem lançou).';
comment on column public.orders.discount_percent is 'Percentual do desconto sobre o subtotal, calculado no servidor.';
comment on column public.orders.discount_authorized_by is 'Gerente (vendas.autorizar) que liberou desconto acima do limite do vendedor.';
comment on column public.orders.first_purchase is 'Marcador "1ª compra": cliente sem pedidos anteriores.';

-- Pedidos de hoje: o vendedor é quem lançou.
update public.orders o
   set seller_id = o.created_by
 where o.created_by is not null
   and exists (select 1 from public.profiles p where p.id = o.created_by);

create index orders_kind_idx on public.orders (organization_id, kind, created_at desc);
create index orders_seller_idx on public.orders (seller_id);

-- O vendedor precisa ser da equipe da gráfica.
create or replace function private.orders_check_seller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seller_id is not null
     and (tg_op = 'INSERT' or new.seller_id is distinct from old.seller_id)
     and not exists (
       select 1 from public.organization_members m
        where m.organization_id = new.organization_id and m.user_id = new.seller_id
     ) then
    raise exception 'O vendedor precisa ser da equipe da gráfica.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger orders_check_seller
  before insert or update of seller_id on public.orders
  for each row execute function private.orders_check_seller();

-- -----------------------------------------------------------------------------
-- Configurações do pedido de venda (uma linha por gráfica; sem linha = padrões)
-- -----------------------------------------------------------------------------
create table public.sales_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  seller_max_discount numeric(5, 2) not null default 15 check (seller_max_discount between 0 and 100),
  manager_max_discount numeric(5, 2) not null default 30 check (manager_max_discount between 0 and 100),
  require_payment_method boolean not null default false,
  warn_overdue_receivables boolean not null default true,
  tag_first_purchase boolean not null default true,
  warn_incomplete_address boolean not null default true,
  default_note text check (default_note is null or char_length(default_note) <= 1000),
  print_code text not null default 'qr' check (print_code in ('qr', 'barras')),
  print_product_images boolean not null default false,
  print_item_order text not null default 'inclusao' check (print_item_order in ('inclusao', 'sku', 'descricao')),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (manager_max_discount >= seller_max_discount)
);

comment on table public.sales_settings is 'Regras do pedido de venda por gráfica (descontos, avisos e impressão).';

create trigger sales_settings_set_updated_at before update on public.sales_settings
  for each row execute function private.set_updated_at();
create trigger sales_settings_audit after insert or update or delete on public.sales_settings
  for each row execute function private.audit_row_change();

alter table public.sales_settings enable row level security;
create policy "Ler configurações de venda" on public.sales_settings for select to authenticated
  using ((select private.is_member(organization_id)));
create policy "Criar configurações de venda" on public.sales_settings for insert to authenticated
  with check ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));
create policy "Alterar configurações de venda" on public.sales_settings for update to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.gerenciar')))
  with check ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));

-- Valores em vigor (com os padrões quando a gráfica ainda não salvou nada).
create or replace function private.sales_settings_for(p_org uuid)
returns public.sales_settings
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s from public.sales_settings s where s.organization_id = p_org),
    row(p_org, 15, 30, false, true, true, true, null, 'qr', false, 'inclusao', null, now(), now())::public.sales_settings
  )
$$;

revoke all on function private.sales_settings_for(uuid) from public;
grant execute on function private.sales_settings_for(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Liberação de desconto pelo gerente (no aparelho do vendedor)
--   O servidor confere a senha do gerente sem trocar a sessão do vendedor e grava
--   a liberação com o acesso do próprio gerente (RLS). Vale 5 minutos e uma venda.
-- -----------------------------------------------------------------------------
create table public.discount_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  authorized_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  max_percent numeric(5, 2) not null check (max_percent > 0 and max_percent <= 100),
  expires_at timestamptz not null default now() + interval '5 minutes',
  used_at timestamptz,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '5 minutes')
);

comment on table public.discount_authorizations is
  'Liberação de desconto acima do limite do vendedor. Uso único, 5 minutos. Só a função create_sale consome.';

create index discount_authorizations_org_idx on public.discount_authorizations (organization_id, created_at desc);

create trigger discount_authorizations_audit after insert or update on public.discount_authorizations
  for each row execute function private.audit_row_change();

alter table public.discount_authorizations enable row level security;
create policy "Ler liberações de desconto" on public.discount_authorizations for select to authenticated
  using (
    (select private.has_permission(organization_id, 'vendas.autorizar'))
    or (select private.has_permission(organization_id, 'vendas.gerenciar'))
  );
create policy "Liberar desconto" on public.discount_authorizations for insert to authenticated
  with check (
    authorized_by = (select auth.uid())
    and used_at is null
    and order_id is null
    and (select private.has_permission(organization_id, 'vendas.autorizar'))
    and max_percent <= (private.sales_settings_for(organization_id)).manager_max_discount
  );
-- Sem update/delete para a equipe: só a função create_sale marca o uso.

-- -----------------------------------------------------------------------------
-- Preço de produto com ficha técnica: só muda com pedidos.alterar_preco
-- -----------------------------------------------------------------------------
create or replace function private.has_bom(p_variant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bom_items b where b.variant_id = p_variant)
$$;

revoke all on function private.has_bom(uuid) from public;
grant execute on function private.has_bom(uuid) to authenticated;

-- Confere o preço de um item com ficha técnica contra o cadastro do canal.
create or replace function private.check_item_price(
  p_org uuid,
  p_variant uuid,
  p_channel public.sales_channel,
  p_price numeric
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_variant is null or not private.has_bom(p_variant) then
    return;
  end if;
  if round(p_price, 2) is distinct from round(public.variant_price(p_variant, p_channel), 2)
     and not private.has_permission(p_org, 'pedidos.alterar_preco') then
    raise exception 'Sem permissão para alterar o preço de produto com ficha técnica.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.check_item_price(uuid, uuid, public.sales_channel, numeric) from public;
grant execute on function private.check_item_price(uuid, uuid, public.sales_channel, numeric) to authenticated;

-- Itens do pedido: mesma sincronização de antes, agora conferindo o preço dos
-- itens novos ou com preço/variação alterados.
create or replace function public.save_order_items(p_order uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_channel public.sales_channel;
  v_keep uuid[];
  v_item jsonb;
  v_pos smallint := 0;
  v_id uuid;
  v_variant uuid;
  v_price numeric;
begin
  select organization_id, channel into v_org, v_channel from public.orders where id = p_order;
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
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    v_price := (v_item ->> 'unit_price')::numeric;

    if v_id is null
       or exists (
         select 1 from public.order_items i
          where i.id = v_id and i.order_id = p_order
            and (i.unit_price is distinct from v_price or i.variant_id is distinct from v_variant)
       ) then
      perform private.check_item_price(v_org, v_variant, v_channel, v_price);
    end if;

    if v_id is null then
      insert into public.order_items (organization_id, order_id, variant_id, description, quantity, unit_price, position)
      values (v_org, p_order, v_variant, v_item ->> 'description',
              (v_item ->> 'quantity')::numeric, v_price, v_pos);
    else
      update public.order_items i
      set variant_id = v_variant,
          description = v_item ->> 'description',
          quantity = (v_item ->> 'quantity')::numeric,
          unit_price = v_price,
          position = v_pos
      where i.id = v_id and i.order_id = p_order
        and (i.variant_id is distinct from v_variant
          or i.description is distinct from v_item ->> 'description'
          or i.quantity is distinct from (v_item ->> 'quantity')::numeric
          or i.unit_price is distinct from v_price
          or i.position is distinct from v_pos);
    end if;
  end loop;
end;
$$;

-- O pedido já nasce no canal certo, para o preço dos itens ser conferido nele.
create or replace function public.create_order(p_org uuid, p_status public.order_status, p_fields jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.orders (organization_id, status, customer_name, channel)
  values (p_org, p_status, p_fields ->> 'customer_name',
          coalesce((p_fields ->> 'channel')::public.sales_channel, 'balcao'))
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
  -- Zera o desconto antes de mexer nos itens para o total nunca ficar negativo no meio do caminho,
  -- e aplica o canal antes, para o preço dos itens ser conferido no canal novo.
  update public.orders
     set discount = 0,
         channel = coalesce((p_fields ->> 'channel')::public.sales_channel, channel)
   where id = p_order;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  perform public.save_order_items(p_order, p_items);
  perform private.apply_order_fields(p_order, p_fields);
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedido de venda
-- -----------------------------------------------------------------------------
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

  -- Entregue na hora: baixa o estoque (pronto ou insumos da ficha) e marca a entrega.
  perform set_config('app.status_note', 'Pedido de venda no balcão.', true);
  update public.orders set status = 'entregue' where id = v_id;

  if p_paid then
    update public.receivables
    set status = 'recebido',
        received_at = (now() at time zone 'America/Sao_Paulo')::date
    where order_id = v_id and status = 'aberto';
  end if;
  return v_id;
end;
$$;

comment on function public.create_sale(uuid, jsonb, jsonb, boolean, uuid) is
  'Pedido de venda: preço do cadastro, desconto em dois níveis, vendedor, estoque baixado e (se pago) a receber recebido.';

revoke all on function public.create_sale(uuid, jsonb, jsonb, boolean, uuid) from public, anon;
grant execute on function public.create_sale(uuid, jsonb, jsonb, boolean, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Aviso de contas em atraso do cliente no pedido de venda. Quem vende vê só o
-- resumo (quantidade, valor e a mais antiga), sem precisar ver o financeiro.
-- -----------------------------------------------------------------------------
create or replace function public.customer_overdue(p_customer uuid)
returns table (overdue_count integer, overdue_total numeric, oldest_due date)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(r.gross), 0), min(r.due_date)
    from public.customers c
    join public.orders o on o.customer_id = c.id
    join public.receivables r on r.order_id = o.id
   where c.id = p_customer
     and (private.has_permission(c.organization_id, 'pedidos.gerenciar')
          or private.has_permission(c.organization_id, 'vendas.gerenciar'))
     and r.status = 'aberto'
     and r.due_date < (now() at time zone 'America/Sao_Paulo')::date
$$;

revoke all on function public.customer_overdue(uuid) from public, anon;
grant execute on function public.customer_overdue(uuid) to authenticated;

-- Fase 8.2 e 8.3: estoque mínimo das variações, estoque inicial sem duplicar, inventário pela
-- quantidade contada (o ajuste define o saldo final) e gráficas de demonstração.

-- -----------------------------------------------------------------------------
-- Estoque mínimo das variações (os insumos já têm)
-- -----------------------------------------------------------------------------
alter table public.product_variants
  add column if not exists min_stock numeric(14, 3) not null default 0 check (min_stock >= 0);

-- -----------------------------------------------------------------------------
-- Saldo anterior e final nos ajustes (movimentos antigos ficam nulos)
-- -----------------------------------------------------------------------------
alter table public.stock_movements
  add column if not exists previous_balance numeric(14, 3),
  add column if not exists final_balance numeric(14, 3);

comment on column public.stock_movements.final_balance is
  'Ajuste de inventário: saldo contado. A quantidade do movimento é a diferença para o saldo anterior.';

-- Estoque inicial: no máximo um por variação (reenvio do formulário não duplica).
create unique index if not exists stock_movements_initial_idx
  on public.stock_movements (variant_id) where reference = 'estoque-inicial';

-- -----------------------------------------------------------------------------
-- Gráficas de demonstração (dados fictícios só entram nelas)
-- -----------------------------------------------------------------------------
alter table public.organizations add column if not exists is_demo boolean not null default false;

-- -----------------------------------------------------------------------------
-- Ajuste só pelo inventário: o gatilho recusa ajuste sem saldo final
-- -----------------------------------------------------------------------------
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
  if new.type = 'ajuste' and new.final_balance is null then
    raise exception 'Ajuste de estoque só pelo inventário (quantidade contada).' using errcode = 'P0001';
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

-- -----------------------------------------------------------------------------
-- Inventário: a quantidade contada vira o saldo final
-- -----------------------------------------------------------------------------
create or replace function public.inventory_count(
  p_material uuid,
  p_variant uuid,
  p_counted numeric,
  p_reason text
)
returns table (previous_balance numeric, final_balance numeric, difference numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_before numeric;
begin
  if (p_material is null) = (p_variant is null) then
    raise exception 'Informe um insumo ou uma variação.' using errcode = '22023';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'A quantidade contada não pode ser negativa.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Informe o motivo do ajuste.' using errcode = '22023';
  end if;

  v_org := coalesce(
    (select organization_id from public.materials where id = p_material),
    (select organization_id from public.product_variants where id = p_variant)
  );
  if v_org is null or not private.has_permission(v_org, 'estoque.gerenciar') then
    raise exception 'Item não encontrado.' using errcode = '42501';
  end if;

  insert into public.stock_balances (organization_id, material_id, variant_id)
  values (v_org, p_material, p_variant)
  on conflict do nothing;
  -- Trava o saldo até o fim da transação: duas contagens ao mesmo tempo não se somam.
  select b.on_hand into v_before from public.stock_balances b
   where (p_material is not null and b.material_id = p_material)
      or (p_variant is not null and b.variant_id = p_variant)
   for update;

  -- Contagem igual ao saldo: nada a ajustar (o banco não aceita movimento de quantidade zero).
  if p_counted <> v_before then
    insert into public.stock_movements
      (organization_id, material_id, variant_id, type, quantity, reason,
       previous_balance, final_balance, created_by)
    values
      (v_org, p_material, p_variant, 'ajuste', p_counted - v_before, btrim(p_reason),
       v_before, p_counted, (select auth.uid()));
  end if;

  return query select v_before, p_counted, p_counted - v_before;
end;
$$;

comment on function public.inventory_count(uuid, uuid, numeric, text) is
  'Inventário: a quantidade contada define o saldo final; grava o ajuste com saldo anterior, final, usuário e motivo.';

revoke all on function public.inventory_count(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.inventory_count(uuid, uuid, numeric, text) to authenticated;

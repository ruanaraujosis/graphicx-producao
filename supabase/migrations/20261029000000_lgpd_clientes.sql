-- LGPD: anonimização de clientes (art. 18, IV e VI). Remove os dados pessoais do cadastro, das
-- cópias nos pedidos e no "a receber" e da trilha de auditoria, mantendo pedidos e valores.

alter table public.customers add column if not exists anonymized_at timestamptz;

comment on column public.customers.anonymized_at is
  'Quando os dados pessoais foram removidos a pedido do titular (LGPD). Cadastro fica inativo.';

-- O nome do cliente no "a receber" passa a ter gatilho próprio: trocar o nome não recalcula
-- valores, taxa nem vencimento, e vale também para contas já recebidas.
drop trigger orders_sync_receivable on public.orders;
create trigger orders_sync_receivable
  after insert or update of status, total, payment_method_id, channel, channel_fee on public.orders
  for each row execute function private.orders_sync_receivable();

create or replace function private.orders_sync_receivable_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.receivables
     set customer_name = new.customer_name
   where order_id = new.id and customer_name is distinct from new.customer_name;
  return null;
end;
$$;

create trigger orders_sync_receivable_name
  after update of customer_name on public.orders
  for each row when (old.customer_name is distinct from new.customer_name)
  execute function private.orders_sync_receivable_name();

create or replace function public.anonymize_customer(p_customer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_orders text[];
  c_name constant text := 'Cliente anonimizado';
  c_customer_keys constant text[] := array[
    'name', 'legal_name', 'document', 'email', 'phone', 'whatsapp',
    'cep', 'street', 'number', 'complement', 'district', 'city', 'state', 'notes'
  ];
  c_order_keys constant text[] := array['customer_name', 'customer_phone'];
begin
  select organization_id into v_org from public.customers where id = p_customer for update;
  if v_org is null or not private.has_permission(v_org, 'cadastros.gerenciar') then
    raise exception 'Cliente não encontrado.' using errcode = '42501';
  end if;

  -- Pedido em andamento ainda precisa de nome e contato para produzir e entregar.
  if exists (
    select 1 from public.orders
     where customer_id = p_customer and status not in ('orcamento', 'entregue', 'cancelado')
  ) then
    raise exception 'O cliente tem pedidos em andamento. Conclua ou cancele antes de anonimizar.'
      using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id::text), '{}') into v_orders
    from public.orders where customer_id = p_customer;

  update public.customers
     set name = c_name, legal_name = null, document = null, email = null, phone = null,
         whatsapp = null, cep = null, street = null, number = null, complement = null,
         district = null, city = null, state = null, notes = null,
         active = false, anonymized_at = now()
   where id = p_customer;

  update public.orders
     set customer_name = c_name, customer_phone = null
   where id = any (v_orders::uuid[]);

  -- Nome digitado na aprovação da arte. Data, IP e navegador continuam como prova da aprovação.
  update public.art_reviews
     set reviewer_name = null
   where order_id = any (v_orders::uuid[]) and reviewer_name is not null;

  -- Por último, para limpar também as linhas que as alterações acima acabaram de gravar.
  update public.audit_log
     set old_data = old_data - c_customer_keys, new_data = new_data - c_customer_keys
   where table_name = 'customers' and record_id = p_customer::text;
  update public.audit_log
     set old_data = old_data - c_order_keys, new_data = new_data - c_order_keys
   where table_name = 'orders' and record_id = any (v_orders);
  update public.audit_log
     set old_data = old_data - 'reviewer_name', new_data = new_data - 'reviewer_name'
   where table_name = 'art_reviews' and organization_id = v_org
     and (coalesce(new_data, old_data) ->> 'order_id') = any (v_orders);
  update public.audit_log
     set old_data = old_data - 'customer_name', new_data = new_data - 'customer_name'
   where table_name = 'receivables' and organization_id = v_org
     and (coalesce(new_data, old_data) ->> 'order_id') = any (v_orders);
end;
$$;

comment on function public.anonymize_customer(uuid) is
  'LGPD: remove os dados pessoais de um cliente (cadastro, pedidos, aprovações de arte e auditoria). Exige cadastros.gerenciar.';

revoke all on function public.anonymize_customer(uuid) from public, anon;
grant execute on function public.anonymize_customer(uuid) to authenticated;

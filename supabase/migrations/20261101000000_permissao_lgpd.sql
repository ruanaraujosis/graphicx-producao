-- Permissão própria para os pedidos de titulares (LGPD): exportar e anonimizar clientes.
-- Só o Administrador começa com ela; cada gráfica concede a outros perfis se quiser.

create or replace function private.valid_permissions()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'pedidos.ver', 'pedidos.gerenciar',
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

-- "gerenciar" inclui "ver" só quando o módulo tem "ver" (o de LGPD não tem).
create or replace function private.expand_permissions(perms text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct p), '{}'::text[])
  from (
    select unnest(perms) as p
    union
    select v from (select replace(unnest(perms), '.gerenciar', '.ver') as v) d
     where v = any (private.valid_permissions())
  ) s
$$;

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
  if v_org is null or not private.has_permission(v_org, 'lgpd.gerenciar') then
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
  'LGPD: remove os dados pessoais de um cliente (cadastro, pedidos, aprovações de arte e auditoria). Exige lgpd.gerenciar.';

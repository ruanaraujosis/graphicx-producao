-- Fase 4: contas a receber automáticas, contas a pagar recorrentes, custo das
-- baixas, relatórios com permissão e painel de TV.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

-- -----------------------------------------------------------------------------
-- Dados (sem login)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'atend@fin.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'financeiro@fin.local');
insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'ana.atend', 'Ana'),
  ('00000000-0000-0000-0000-0000000000f2', 'fabio.financeiro', 'Fábio');
insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-0000000000f0', 'grafica-fin', 'Gráfica Fin');
insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-0000000000f0', u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000f1'::uuid, 'Atendimento'),
  ('00000000-0000-0000-0000-0000000000f2'::uuid, 'Financeiro')
) as u (id, role_name)
join public.organization_roles r
  on r.organization_id = '10000000-0000-0000-0000-0000000000f0' and r.name = u.role_name;

insert into public.payment_methods (id, organization_id, name, kind, fee_pct, settlement_days)
values ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Cartão', 'cartao_credito', 10, 30);

insert into public.materials (id, organization_id, name, unit)
values ('20000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Papel', 'folha');
insert into public.products (id, organization_id, name)
values ('40000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Bloco');
insert into public.product_variants (id, organization_id, product_id, sku, name, base_price)
values ('50000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0',
        '40000000-0000-0000-0000-0000000000f1', 'BL', 'A5', 10);
insert into public.bom_items (organization_id, variant_id, material_id, quantity, waste_pct)
values ('10000000-0000-0000-0000-0000000000f0', '50000000-0000-0000-0000-0000000000f1',
        '20000000-0000-0000-0000-0000000000f1', 2, 0);
insert into public.stock_movements (organization_id, material_id, type, quantity, unit_cost)
values ('10000000-0000-0000-0000-0000000000f0', '20000000-0000-0000-0000-0000000000f1', 'entrada', 100, 0.5);

-- -----------------------------------------------------------------------------
-- Pedido gera a conta a receber
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal1"}';
set local role authenticated;

select public.create_order('10000000-0000-0000-0000-0000000000f0', 'novo',
  '{"customer_name":"Cliente Fin","payment_method_id":"30000000-0000-0000-0000-0000000000f1","shipping":"0","discount":"0"}',
  '[{"variant_id":"50000000-0000-0000-0000-0000000000f1","description":"Bloco","quantity":"10","unit_price":"10"}]')
  as order_id \gset

select is((select count(*) from public.receivables), 0::bigint, 'atendimento não vê o financeiro');

reset role;
select results_eq(
  format($$ select gross, fee, net, status from public.receivables where order_id = %L $$, :'order_id'),
  $$ values (100.00::numeric, 10.00::numeric, 90.00::numeric, 'aberto'::text) $$,
  'pedido confirmado cria a conta: total, taxa da forma de pagamento e líquido');
select is((select due_date from public.receivables where order_id = :'order_id'),
  (now() at time zone 'America/Sao_Paulo')::date + 30, 'vencimento pelo prazo de recebimento');
select ok((select confirmed_at is not null from public.orders where id = :'order_id'), 'pedido guarda a data da confirmação');

set local role authenticated;
select public.update_order(:'order_id',
  '{"customer_name":"Cliente Fin","payment_method_id":"30000000-0000-0000-0000-0000000000f1","shipping":"0","discount":"0"}',
  '[{"variant_id":"50000000-0000-0000-0000-0000000000f1","description":"Bloco","quantity":"20","unit_price":"10"}]') as _ \gset
reset role;
select is((select gross from public.receivables where order_id = :'order_id'), 200.00::numeric,
  'a conta acompanha o novo total do pedido');

-- -----------------------------------------------------------------------------
-- Impressão: baixa guarda o custo médio
-- -----------------------------------------------------------------------------
set local role authenticated;
select public.change_order_status(:'order_id', 'em_impressao') as _ \gset
reset role;
select is((select sum(quantity * cost_at) from public.stock_movements where type = 'consumo'
           and organization_id = '10000000-0000-0000-0000-0000000000f0'),
  20.0000000::numeric, 'baixa guarda o custo médio (40 folhas × 0,50)');

-- -----------------------------------------------------------------------------
-- Financeiro: recebe, não altera o bruto, relatórios
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated","aal":"aal2"}';
set local role authenticated;

select throws_ok(
  format($$ update public.receivables set gross = 1 where order_id = %L $$, :'order_id'),
  '23514', 'O valor da conta de um pedido acompanha o pedido. Edite o pedido.',
  'o bruto da conta de pedido não é editado à mão');

select lives_ok(
  format($$ update public.receivables set status = 'recebido', received_at = current_date where order_id = %L $$, :'order_id'),
  'financeiro dá baixa no recebimento');

select results_eq(
  $$ select gross_revenue, fees, material_cost from public.finance_dre(
       '10000000-0000-0000-0000-0000000000f0', date_trunc('month', current_date)::date, current_date) $$,
  $$ values (200.00::numeric, 20.00::numeric, 20.00::numeric) $$,
  'DRE: receita, taxas e custo dos insumos do mês');

select is((select sum(received) from public.finance_cash_flow(
  '10000000-0000-0000-0000-0000000000f0', current_date, current_date)), 180.00::numeric,
  'fluxo de caixa: recebido líquido (200 − 20)');

select results_eq(
  $$ select quantity, revenue, material_cost, fees, margin from public.finance_product_margin(
       '10000000-0000-0000-0000-0000000000f0', date_trunc('month', current_date)::date, current_date) $$,
  $$ values (20.000::numeric, 200.00::numeric, 20.00::numeric, 20.00::numeric, 160.00::numeric) $$,
  'margem por produto: 200 − 20 de insumos − 20 de taxa');

-- Conta a pagar mensal: paga, gera a do mês seguinte.
insert into public.payables (id, organization_id, description, amount, due_date, recurrence)
values ('60000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'Aluguel', 1500, '2026-10-05', 'mensal');
update public.payables set status = 'pago', paid_at = '2026-10-05' where id = '60000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.payables where description = 'Aluguel' and due_date = '2026-11-05' and status = 'aberto'),
  1::bigint, 'conta mensal paga gera a do mês seguinte');
update public.payables set notes = 'ok' where id = '60000000-0000-0000-0000-0000000000f1';
select is((select count(*) from public.payables where description = 'Aluguel'), 2::bigint,
  'a próxima parcela não duplica');

-- Atendimento não roda relatório.
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated","aal":"aal1"}';
select throws_ok(
  $$ select * from public.finance_dre('10000000-0000-0000-0000-0000000000f0', current_date, current_date) $$,
  '42501', 'Sem permissão para ver o financeiro.', 'atendimento não roda o DRE');

-- Cancelar pedido cancela a conta aberta.
select public.create_order('10000000-0000-0000-0000-0000000000f0', 'novo',
  '{"customer_name":"Desistente","shipping":"0","discount":"0"}',
  '[{"description":"Avulso","quantity":"1","unit_price":"50"}]') as order2 \gset
select public.change_order_status(:'order2', 'cancelado', 'Desistiu') as _ \gset
reset role;
select is((select status from public.receivables where order_id = :'order2'), 'cancelado',
  'cancelar o pedido cancela a conta a receber');

-- -----------------------------------------------------------------------------
-- TV
-- -----------------------------------------------------------------------------
insert into public.tv_devices (id, organization_id, name)
values ('70000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f0', 'TV Produção');

set local role service_role;
select ok(
  (select (public.tv_snapshot(token) -> 'board' ->> 'em_impressao')::int = 1
          and public.tv_snapshot(token) -> 'revenue' = 'null'::jsonb
   from public.tv_devices where id = '70000000-0000-0000-0000-0000000000f1'),
  'TV mostra o quadro e esconde valores por padrão');

reset role;
update public.tv_devices set show_financials = true where id = '70000000-0000-0000-0000-0000000000f1';
set local role service_role;
select is(
  (select (public.tv_snapshot(token) -> 'revenue' ->> 'month')::numeric
   from public.tv_devices where id = '70000000-0000-0000-0000-0000000000f1'),
  200.00::numeric, 'com valores ligados, mostra o faturamento do mês');
select ok(public.tv_snapshot('token-que-nao-existe-token-que-nao-existe') is null, 'token inválido não abre nada');

select * from finish();
rollback;

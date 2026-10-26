-- Regras da Fase 3 no banco: numeração, totais, reserva/baixa de estoque,
-- permissões de status, isolamento entre gráficas e aprovação de arte.
-- Rode com `supabase test db` (o CI roda a cada PR).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(37);

-- -----------------------------------------------------------------------------
-- Dados de teste (como postgres, sem login: os guardas deixam passar)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'atendimento@teste.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'designer@teste.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'producao@teste.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'outra@teste.local');

insert into public.profiles (id, username, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana.atendimento', 'Ana'),
  ('00000000-0000-0000-0000-0000000000a2', 'davi.designer', 'Davi'),
  ('00000000-0000-0000-0000-0000000000a3', 'pedro.producao', 'Pedro'),
  ('00000000-0000-0000-0000-0000000000b1', 'olga.atendimento', 'Olga');

insert into public.organizations (id, slug, name) values
  ('10000000-0000-0000-0000-00000000000a', 'grafica-a', 'Gráfica A'),
  ('10000000-0000-0000-0000-00000000000b', 'grafica-b', 'Gráfica B');

insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-00000000000a', u.id, r.id
from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'Atendimento'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'Designer'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'Produção')
) as u (id, role_name)
join public.organization_roles r
  on r.organization_id = '10000000-0000-0000-0000-00000000000a' and r.name = u.role_name;

insert into public.organization_members (organization_id, user_id, role_id)
select '10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', r.id
from public.organization_roles r
where r.organization_id = '10000000-0000-0000-0000-00000000000b' and r.name = 'Atendimento';

-- Papel (insumo) com 100 folhas; bloco sob encomenda usa 2 folhas; chaveiro pronta-entrega com 10 peças.
insert into public.materials (id, organization_id, name, unit)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Papel', 'folha');

insert into public.products (id, organization_id, name, fulfillment) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Bloco', 'sob_encomenda'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Chaveiro', 'pronta_entrega');

insert into public.product_variants (id, organization_id, product_id, sku, name, base_price) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-000000000001', 'BLOCO', 'A5', 10),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
   '30000000-0000-0000-0000-000000000002', 'CHAV', 'Padrão', 5);

insert into public.bom_items (organization_id, variant_id, material_id, quantity, waste_pct)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 2, 0);

insert into public.stock_movements (organization_id, material_id, type, quantity, unit_cost)
values ('10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'entrada', 100, 0.1);
insert into public.stock_movements (organization_id, variant_id, type, quantity)
values ('10000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000002', 'entrada', 10);

-- -----------------------------------------------------------------------------
-- Atendimento cria o pedido: número, reserva e totais
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}';
set local role authenticated;

insert into public.orders (id, organization_id, customer_name, status, shipping)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'Cliente Um', 'novo', 7);

select is((select number from public.orders where id = '50000000-0000-0000-0000-000000000001'),
  1001, 'primeiro pedido da gráfica recebe o número 1001');

insert into public.order_items (id, organization_id, order_id, variant_id, description, quantity, unit_price)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
        '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Bloco A5', 5, 10);

select is((select total from public.orders where id = '50000000-0000-0000-0000-000000000001'),
  57.00::numeric, 'total = itens (5 × 10) + frete (7)');

reset role;
select is((select reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001'),
  10.000::numeric, 'pedido confirmado reserva os insumos (5 × 2 folhas)');
select is((select stock_state::text from public.order_items where id = '60000000-0000-0000-0000-000000000001'),
  'reservado', 'item fica como reservado');

set local role authenticated;
update public.order_items set quantity = 6 where id = '60000000-0000-0000-0000-000000000001';
reset role;
select is((select reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001'),
  12.000::numeric, 'mudar a quantidade refaz a reserva');

set local role authenticated;
select throws_ok(
  $$ update public.orders set status = 'cancelado' where id = '50000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'status não muda por UPDATE direto');

select throws_ok(
  $$ update public.orders set discount = 100 where id = '50000000-0000-0000-0000-000000000001' $$,
  '23514', 'O desconto é maior que o valor do pedido.', 'desconto não deixa o total negativo');

-- -----------------------------------------------------------------------------
-- Isolamento: a outra gráfica não vê nada
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated","aal":"aal1"}';
select is((select count(*) from public.orders), 0::bigint, 'outra gráfica não vê o pedido');
select is((select count(*) from public.order_items), 0::bigint, 'outra gráfica não vê os itens');
select throws_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000001', 'cancelado', 'x') $$,
  '42501', null, 'outra gráfica não muda o status');

-- -----------------------------------------------------------------------------
-- Designer: link, prova e limites de status
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000001', 'cancelado', 'x') $$,
  '42501', null, 'designer não cancela pedido');
select throws_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000001', 'em_impressao') $$,
  '42501', null, 'designer não manda para impressão');
select lives_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000001', 'arte_em_criacao') $$,
  'designer move para Arte em Criação');

insert into public.art_links (organization_id, order_id)
values ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001');
select ok((select char_length(token) >= 32 from public.art_links
  where order_id = '50000000-0000-0000-0000-000000000001' and revoked_at is null),
  'link de arte recebe token aleatório longo');

insert into public.art_versions (id, organization_id, order_id, proof_path, proof_mime)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a',
        '50000000-0000-0000-0000-000000000001', 'a/b/provas/v1.jpg', 'image/jpeg');
select is((select status::text from public.orders where id = '50000000-0000-0000-0000-000000000001'),
  'aguardando_aprovacao', 'prova enviada leva o pedido para Aguardando Aprovação');
select is((select version from public.art_versions where id = '70000000-0000-0000-0000-000000000001'),
  1::smallint, 'primeira prova é a v1');

select throws_ok(
  $$ select public.submit_art_review(
       (select token from public.art_links limit 1), '70000000-0000-0000-0000-000000000001',
       'aprovada', null, '[]', null, null, null) $$,
  '42501', null, 'equipe não registra aprovação do cliente pelo banco');

-- -----------------------------------------------------------------------------
-- Cliente (pelo servidor, com a chave secreta): pede alteração e depois aprova
-- -----------------------------------------------------------------------------
reset role;
set local role service_role;

select throws_ok(
  $$ select public.submit_art_review('token-invalido-token-invalido-xx', '70000000-0000-0000-0000-000000000001',
       'aprovada', null, '[]', null, null, null) $$,
  '42501', 'Link inválido ou expirado.', 'token inválido é recusado');

select lives_ok(
  $$ select public.submit_art_review(
       (select token from public.art_links where revoked_at is null limit 1),
       '70000000-0000-0000-0000-000000000001', 'alteracao', 'Trocar a cor', '[{"x":0.5,"y":0.5}]',
       'Cliente', '200.1.2.3', 'teste') $$,
  'cliente pede alteração');
select is((select status::text from public.orders where id = '50000000-0000-0000-0000-000000000001'),
  'arte_em_criacao', 'pedido de alteração volta para Arte em Criação');

reset role;
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}';
set local role authenticated;
insert into public.art_versions (id, organization_id, order_id, proof_path, proof_mime)
values ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a',
        '50000000-0000-0000-0000-000000000001', 'a/b/provas/v2.jpg', 'image/jpeg');

reset role;
set local role service_role;
select lives_ok(
  $$ select public.submit_art_review(
       (select token from public.art_links where revoked_at is null limit 1),
       '70000000-0000-0000-0000-000000000002', 'aprovada', null, '[]', 'Cliente', '200.1.2.3', 'teste') $$,
  'cliente aprova a v2');
select is((select status::text from public.orders where id = '50000000-0000-0000-0000-000000000001'),
  'aprovado', 'aprovação move o pedido para Aprovado');
select is((select count(*) from public.art_reviews where order_id = '50000000-0000-0000-0000-000000000001'),
  2::bigint, 'as duas respostas ficam registradas (prova de aceite)');

-- -----------------------------------------------------------------------------
-- Produção: impressão dá baixa; item baixado não muda
-- -----------------------------------------------------------------------------
reset role;
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated","aal":"aal1"}';
set local role authenticated;
select lives_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000001', 'em_impressao') $$,
  'produção manda para impressão');

reset role;
select results_eq(
  $$ select on_hand, reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values (88.000::numeric, 0.000::numeric) $$,
  'impressão transforma a reserva em baixa (100 − 12)');

-- -----------------------------------------------------------------------------
-- Orçamento não reserva; cancelamento devolve; pronta-entrega sai no envio
-- -----------------------------------------------------------------------------
set local "request.jwt.claims" to
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}';
set local role authenticated;

select throws_ok(
  $$ update public.order_items set quantity = 1 where id = '60000000-0000-0000-0000-000000000001' $$,
  '23514', 'Este item já foi baixado do estoque e não pode mudar.', 'item baixado não muda');

insert into public.orders (id, organization_id, customer_name, status)
values ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'Cliente Dois', 'orcamento');
insert into public.order_items (organization_id, order_id, variant_id, description, quantity, unit_price) values
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000001', 'Bloco', 10, 10),
  ('10000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002', 'Chaveiro', 3, 5);

reset role;
select is((select reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001'),
  0.000::numeric, 'orçamento não reserva');

set local role authenticated;
do $$ begin perform public.change_order_status('50000000-0000-0000-0000-000000000002', 'novo'); end $$;
reset role;
select results_eq(
  $$ select (select reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001'),
            (select reserved from public.stock_balances where variant_id = '40000000-0000-0000-0000-000000000002') $$,
  $$ values (20.000::numeric, 3.000::numeric) $$,
  'virar pedido reserva insumos e peças prontas');

set local role authenticated;
select throws_ok(
  $$ select public.change_order_status('50000000-0000-0000-0000-000000000002', 'cancelado') $$,
  '22023', 'Informe o motivo do cancelamento.', 'cancelar exige motivo');
do $$ begin perform public.change_order_status('50000000-0000-0000-0000-000000000002', 'cancelado', 'Cliente desistiu'); end $$;
reset role;
select results_eq(
  $$ select (select reserved from public.stock_balances where material_id = '20000000-0000-0000-0000-000000000001'),
            (select reserved from public.stock_balances where variant_id = '40000000-0000-0000-0000-000000000002') $$,
  $$ values (0.000::numeric, 0.000::numeric) $$,
  'cancelar devolve as reservas');

select is((select count(*) from public.order_events where order_id = '50000000-0000-0000-0000-000000000002'), 3::bigint,
  'linha do tempo registra criação e as duas mudanças de status');

-- -----------------------------------------------------------------------------
-- Gravação atômica (create_order / update_order)
-- -----------------------------------------------------------------------------
set local role authenticated;

select lives_ok(
  $$ select public.create_order('10000000-0000-0000-0000-00000000000a', 'novo',
       '{"customer_name":"Cliente Três","discount":"5","shipping":"0","channel":"whatsapp"}',
       '[{"variant_id":"40000000-0000-0000-0000-000000000001","description":"Bloco","quantity":"2","unit_price":"10"}]') $$,
  'create_order grava pedido e itens juntos');
select is((select total from public.orders where customer_name = 'Cliente Três'),
  15.00::numeric, 'desconto entra depois dos itens (2 × 10 − 5)');

select throws_ok(
  $$ select public.create_order('10000000-0000-0000-0000-00000000000a', 'novo',
       '{"customer_name":"Sem Itens"}', '[]') $$,
  '22023', 'Inclua pelo menos um item.', 'pedido sem itens é recusado');
select is((select count(*) from public.orders where customer_name = 'Sem Itens'),
  0::bigint, 'nada fica gravado quando a criação falha');

select lives_ok(
  $$ select public.update_order((select id from public.orders where customer_name = 'Cliente Três'),
       '{"customer_name":"Cliente Três","discount":"0","channel":"whatsapp"}',
       '[{"variant_id":"40000000-0000-0000-0000-000000000001","description":"Bloco","quantity":"3","unit_price":"10"}]') $$,
  'update_order troca os itens');
select is((select total from public.orders where customer_name = 'Cliente Três'),
  30.00::numeric, 'total recalculado após a edição');

select * from finish();
rollback;

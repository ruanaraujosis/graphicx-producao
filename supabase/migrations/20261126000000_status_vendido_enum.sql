-- =============================================================================
-- Fase 9.2 — Status "Vendido" (parte 1: o valor do enum)
--   Fica num arquivo próprio: valor novo de enum não pode ser usado na mesma
--   transação em que é criado. ⚠️ Não dá para remover este valor depois.
-- =============================================================================
alter type public.order_status add value if not exists 'vendido';

alter table public.orders add column if not exists sold_at timestamptz;
comment on column public.orders.sold_at is 'Quando a venda foi concluída (status Vendido).';

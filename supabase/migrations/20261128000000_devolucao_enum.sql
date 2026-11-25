-- =============================================================================
-- Fase 9.4 — Cancelamento e devolução (parte 1: o valor do enum)
--   Arquivo próprio: valor novo de enum não pode ser usado na mesma transação.
--   ⚠️ Não dá para remover este valor depois.
-- =============================================================================
alter type public.order_event_type add value if not exists 'devolucao';

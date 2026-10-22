-- =============================================================================
-- Fase 5 (etapa 5) — Envio dos pedidos da Shopee
--   Como a loja entrega os pacotes à transportadora (levar até a agência ou
--   coleta) e quando o envio foi organizado na Shopee.
-- =============================================================================

alter table public.marketplace_shops
  add column ship_mode text not null default 'dropoff' check (ship_mode in ('dropoff', 'pickup'));

comment on column public.marketplace_shops.ship_mode is
  'dropoff: a gráfica leva os pacotes à agência; pickup: a transportadora coleta (primeiro horário disponível).';

grant update (ship_mode) on public.marketplace_shops to authenticated;

alter table public.orders
  add column shipment_arranged_at timestamptz;

comment on column public.orders.shipment_arranged_at is
  'Quando o envio foi organizado no marketplace (a etiqueta pode ser impressa a partir daí).';

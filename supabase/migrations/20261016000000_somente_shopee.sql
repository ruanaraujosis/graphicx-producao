-- =============================================================================
-- Somente Shopee: Magalu e TikTok Shop saem do produto (decisão do cliente em
-- 2026-10-11). Os tipos são recriados sem esses valores; dados que os usavam
-- voltam para o balcão (cadastros) ou são apagados (regras de preço e lojas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dados que usam os valores retirados
-- -----------------------------------------------------------------------------
delete from public.channel_price_rules where channel::text in ('magalu', 'tiktok');
delete from public.variant_channel_prices where channel::text in ('magalu', 'tiktok');
delete from public.marketplace_shops where marketplace::text in ('magalu', 'tiktok');
update public.customers set origin = 'balcao' where origin::text in ('magalu', 'tiktok');
update public.orders set channel = 'balcao' where channel::text in ('magalu', 'tiktok');
update public.receivables set channel = 'balcao' where channel::text in ('magalu', 'tiktok');

-- -----------------------------------------------------------------------------
-- Canal de venda
-- -----------------------------------------------------------------------------
alter type public.sales_channel rename to sales_channel_antigo;
create type public.sales_channel as enum ('balcao', 'shopee', 'whatsapp');

-- O gatilho e a função de preço dependem do tipo antigo: saem e voltam iguais.
drop trigger orders_sync_receivable on public.orders;
drop function public.variant_price(uuid, public.sales_channel_antigo);

alter table public.customers alter column origin drop default;
alter table public.customers
  alter column origin type public.sales_channel using origin::text::public.sales_channel;
alter table public.customers alter column origin set default 'balcao';

alter table public.orders alter column channel drop default;
alter table public.orders
  alter column channel type public.sales_channel using channel::text::public.sales_channel;
alter table public.orders alter column channel set default 'balcao';

alter table public.channel_price_rules
  alter column channel type public.sales_channel using channel::text::public.sales_channel;
alter table public.variant_channel_prices
  alter column channel type public.sales_channel using channel::text::public.sales_channel;
alter table public.receivables
  alter column channel type public.sales_channel using channel::text::public.sales_channel;

drop type public.sales_channel_antigo;

-- Mesma regra de src/lib/catalog/pricing.ts (há teste).
create or replace function public.variant_price(p_variant uuid, p_channel public.sales_channel)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select vcp.price from public.variant_channel_prices vcp
      where vcp.variant_id = v.id and vcp.channel = p_channel),
    round(v.base_price * (1 + coalesce(r.adjustment_pct, 0) / 100), 2)
  )
  from public.product_variants v
  left join public.channel_price_rules r
    on r.organization_id = v.organization_id and r.channel = p_channel
  where v.id = p_variant
$$;

create trigger orders_sync_receivable
  after insert or update of status, total, payment_method_id, customer_name, channel, channel_fee on public.orders
  for each row execute function private.orders_sync_receivable();

-- -----------------------------------------------------------------------------
-- Marketplace: só a Shopee
-- -----------------------------------------------------------------------------
alter type public.marketplace rename to marketplace_antigo;
create type public.marketplace as enum ('shopee');
alter table public.marketplace_shops
  alter column marketplace type public.marketplace using marketplace::text::public.marketplace;
drop type public.marketplace_antigo;

-- =============================================================================
-- Limite de tentativas de senha no login
--   Usa a mesma tabela de janelas (private.rate_limits) das rotas públicas.
--   Só o servidor (chave secreta) chama estas funções.
-- =============================================================================

-- Já passou do limite na janela? Só consulta, não conta tentativa.
create or replace function public.rate_limit_blocked(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.hits >= p_limit
      from private.rate_limits r
     where r.key = p_key
       and r.window_start >= now() - make_interval(secs => p_window_seconds)
  ), false)
$$;

-- Zera a contagem (ex.: login com sucesso).
create or replace function public.rate_limit_reset(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.rate_limits where key = p_key
$$;

revoke all on function public.rate_limit_blocked(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_reset(text) from public, anon, authenticated;
grant execute on function public.rate_limit_blocked(text, integer, integer) to service_role;
grant execute on function public.rate_limit_reset(text) to service_role;

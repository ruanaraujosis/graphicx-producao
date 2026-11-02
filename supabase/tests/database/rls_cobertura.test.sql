-- Cobertura do RLS: toda tabela do schema public tem RLS e políticas; views respeitam o RLS
-- de quem consulta; o papel anônimo não tem acesso direto a nenhuma tabela.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '',
  'todas as tabelas do public têm RLS ativo'
);

-- Tabelas sem políticas ficam fechadas para os clientes e só o servidor (chave secreta) ou
-- funções security definer as acessam. Nova entrada aqui precisa de justificativa.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('access_logs', 'order_counters', 'tv_pairings')
      and not exists (
        select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
      )),
  '',
  'toda tabela do public tem políticas (exceto as fechadas de propósito)'
);

select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  '',
  'views do public usam security_invoker (aplicam o RLS de quem consulta)'
);

select is(
  (select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'),
  '',
  'o papel anônimo não tem privilégios em tabelas do public'
);

select * from finish();
rollback;

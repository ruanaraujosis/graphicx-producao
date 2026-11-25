-- Limite de tentativas de senha no login: só o servidor conta, consulta e zera.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select is(public.rate_limit_blocked('login:teste', 3, 900), false, 'sem tentativas: liberado');
do $$ begin perform public.rate_limit_hit('login:teste', 3, 900); perform public.rate_limit_hit('login:teste', 3, 900); end $$;
select is(public.rate_limit_blocked('login:teste', 3, 900), false, '2 erros de 3: liberado');
do $$ begin perform public.rate_limit_hit('login:teste', 3, 900); end $$;
select is(public.rate_limit_blocked('login:teste', 3, 900), true, '3 erros de 3: bloqueado');
do $$ begin perform public.rate_limit_reset('login:teste'); end $$;
select is(public.rate_limit_blocked('login:teste', 3, 900), false, 'login certo zera a contagem');

set local role authenticated;
select throws_ok($$ select public.rate_limit_blocked('login:teste', 3, 900) $$, '42501', null,
  'quem está logado não consulta');
reset role;
set local role anon;
select throws_ok($$ select public.rate_limit_reset('login:teste') $$, '42501', null,
  'visitante não zera a contagem');
reset role;

select * from finish();
rollback;

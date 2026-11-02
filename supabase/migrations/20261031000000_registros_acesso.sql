-- Marco Civil da Internet (art. 15): registros de acesso à aplicação (data, hora e IP), sob
-- sigilo, por 6 meses. Só o servidor grava e lê; uma rotina diária apaga o que passou do prazo.

create table public.access_logs (
  id bigint generated always as identity primary key,
  -- Sem chave estrangeira: o registro precisa sobreviver à exclusão da conta durante o prazo.
  user_id uuid not null,
  event text not null check (event in ('login', 'link')),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  created_at timestamptz not null default now()
);

comment on table public.access_logs is
  'Registros de acesso (Marco Civil, art. 15): 6 meses, sob sigilo. Só o servidor acessa.';

create index access_logs_created_idx on public.access_logs (created_at);
create index access_logs_user_idx on public.access_logs (user_id, created_at desc);

alter table public.access_logs enable row level security;
-- Sem políticas: só o servidor (chave secreta) acessa.
revoke all on public.access_logs from anon, authenticated;

-- Todo dia às 3h45 (horário de Brasília).
select cron.schedule('registros-acesso-limpeza', '45 6 * * *',
  $$delete from public.access_logs where created_at < now() - interval '6 months'$$);

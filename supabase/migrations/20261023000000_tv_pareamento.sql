-- =============================================================================
-- TV: conectar com código (como o YouTube), religar e excluir
--   A TV abre /tv, recebe um código curto e espera. Alguém logado na gráfica
--   digita o código e escolhe a TV; a TV recebe o link dela e entra no painel.
-- =============================================================================

create table public.tv_pairings (
  id uuid primary key default gen_random_uuid(),
  -- 6 caracteres sem letras confusas (0/O, 1/I): fácil de ler na TV.
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  -- A TV guarda o segredo; aqui só o hash (sha256 em hex).
  secret_hash text not null check (char_length(secret_hash) = 64),
  device_id uuid references public.tv_devices (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.tv_pairings is
  'Pareamento de TV por código (10 min). Só o servidor lê e escreve; a TV prova quem é pelo segredo.';

-- Um código vale para um pareamento em aberto por vez.
create unique index tv_pairings_code_idx on public.tv_pairings (code) where linked_at is null;
create index tv_pairings_expires_idx on public.tv_pairings (expires_at);

alter table public.tv_pairings enable row level security;
-- Sem políticas: só o servidor (chave secreta) acessa.
revoke all on public.tv_pairings from anon, authenticated;

-- TV: a equipe pode excluir (antes só desligava).
create policy "Excluir dispositivos de TV" on public.tv_devices for delete to authenticated
  using ((select private.has_permission(organization_id, 'configuracoes.gerenciar')));
grant delete on public.tv_devices to authenticated;

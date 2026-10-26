-- =============================================================================
-- Comissão de cada vendedor (percentual sobre as vendas que a pessoa lança)
--   Usada no ranking da equipe do Início. Quem vê o financeiro vê todas; cada
--   pessoa vê a própria. Só o financeiro (gerenciar) define.
-- =============================================================================

create table public.seller_commissions (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rate numeric(5, 2) not null check (rate between 0 and 100),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

comment on table public.seller_commissions is
  'Percentual de comissão por vendedor e gráfica. Sem linha = sem comissão.';

create trigger seller_commissions_set_updated_at before update on public.seller_commissions
  for each row execute function private.set_updated_at();
create trigger seller_commissions_audit after insert or update or delete on public.seller_commissions
  for each row execute function private.audit_row_change();

alter table public.seller_commissions enable row level security;
create policy "Ler comissões" on public.seller_commissions for select to authenticated
  using (
    (select private.has_permission(organization_id, 'financeiro.ver'))
    or (user_id = (select auth.uid()) and (select private.is_member(organization_id)))
  );
create policy "Definir comissões" on public.seller_commissions for insert to authenticated
  with check (
    (select private.has_permission(organization_id, 'financeiro.gerenciar'))
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = seller_commissions.organization_id
        and m.user_id = seller_commissions.user_id
    )
  );
create policy "Alterar comissões" on public.seller_commissions for update to authenticated
  using ((select private.has_permission(organization_id, 'financeiro.gerenciar')))
  with check ((select private.has_permission(organization_id, 'financeiro.gerenciar')));
create policy "Remover comissões" on public.seller_commissions for delete to authenticated
  using ((select private.has_permission(organization_id, 'financeiro.gerenciar')));

revoke all on public.seller_commissions from anon;

-- =============================================================================
-- MFA configurável por perfil
--   Antes: o MFA era obrigatório para o Administrador e para quem tinha uma
--   permissão sensível (equipe/configurações/financeiro .gerenciar).
--   Agora: cada perfil tem a opção "exigir MFA". O Administrador continua
--   sempre com MFA (restrição no banco). Os perfis existentes mantêm o
--   comportamento de antes.
-- =============================================================================

alter table public.organization_roles add column require_mfa boolean not null default false;

comment on column public.organization_roles.require_mfa is
  'Quem usa este perfil precisa da verificação em duas etapas (MFA). Sempre verdadeiro para o Administrador.';

-- Mantém o que valia até aqui.
update public.organization_roles
set require_mfa = is_admin or (permissions && private.sensitive_permissions());

alter table public.organization_roles
  add constraint organization_roles_admin_requires_mfa check (not is_admin or require_mfa);

-- O banco passa a seguir a opção do perfil.
create or replace function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.id is null then false
    when r.is_admin or r.require_mfa then private.is_aal2()
    else true
  end
  from private.member_role_row(org) r
$$;

drop function private.role_requires_mfa(boolean, text[]);

-- Perfis iniciais das próximas gráficas: MFA no Administrador e no Financeiro.
create or replace function private.seed_default_roles(org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_roles (organization_id, name, description, permissions, is_admin, require_mfa)
  values
    (org, 'Administrador', 'Acesso total à gráfica, equipe, perfis e configurações.',
      private.valid_permissions(), true, true),
    (org, 'Atendimento', 'Pedidos, clientes, orçamentos e artes.',
      array['pedidos.gerenciar', 'artes.gerenciar', 'cadastros.gerenciar', 'pcp.ver', 'estoque.ver', 'expedicao.ver'],
      false, false),
    (org, 'Designer', 'Fila de artes, upload de provas e histórico de versões.',
      array['artes.gerenciar', 'pedidos.ver', 'pcp.ver'], false, false),
    (org, 'Produção', 'Painel PCP, apontamento de etapas e consumo de insumos.',
      array['pcp.gerenciar', 'estoque.gerenciar', 'pedidos.ver'], false, false),
    (org, 'Expedição', 'Separação, etiquetas, despacho e rastreio.',
      array['expedicao.gerenciar', 'pedidos.ver', 'pcp.ver'], false, false),
    (org, 'Financeiro', 'Contas a receber e a pagar, NF-e e relatórios.',
      array['financeiro.gerenciar', 'nfe.gerenciar', 'relatorios.ver', 'pedidos.ver'], false, true)
  on conflict do nothing;
end;
$$;

revoke all on function private.seed_default_roles(uuid) from public;

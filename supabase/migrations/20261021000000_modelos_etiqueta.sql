-- =============================================================================
-- Modelos de etiqueta da gráfica (envio e identificação do pedido)
--   Cada gráfica cria/edita os seus: tamanho, elementos posicionados em mm
--   (textos com campos do pedido, QR Code, imagens, caixas, linhas) e uma arte
--   de fundo opcional (o modelo próprio da gráfica). Um padrão por tipo.
-- =============================================================================

create table public.label_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('envio', 'identificacao')),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  width_mm numeric(5, 1) not null check (width_mm between 20 and 210),
  height_mm numeric(5, 1) not null check (height_mm between 15 and 297),
  -- [{id, type, x, y, w, h, ...}] validado no servidor (Zod)
  elements jsonb not null default '[]'::jsonb
    check (jsonb_typeof(elements) = 'array' and jsonb_array_length(elements) <= 80),
  background_path text check (background_path is null or char_length(background_path) <= 300),
  is_default boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.label_templates is
  'Modelos de etiqueta da gráfica. Sem modelo próprio, o GraphicX usa o modelo embutido.';

create index label_templates_org_idx on public.label_templates (organization_id, kind);
-- Um padrão por gráfica e tipo.
create unique index label_templates_default_idx on public.label_templates (organization_id, kind)
  where is_default;

create trigger label_templates_set_updated_at before update on public.label_templates
  for each row execute function private.set_updated_at();
create trigger label_templates_audit after insert or update or delete on public.label_templates
  for each row execute function private.audit_row_change();

alter table public.label_templates enable row level security;
create policy "Ler modelos de etiqueta" on public.label_templates for select to authenticated
  using ((select private.has_any_permission(organization_id,
    'pedidos.ver', 'expedicao.ver', 'configuracoes.ver')));
create policy "Criar modelos de etiqueta" on public.label_templates for insert to authenticated
  with check ((select private.has_any_permission(organization_id, 'configuracoes.gerenciar', 'expedicao.gerenciar')));
create policy "Editar modelos de etiqueta" on public.label_templates for update to authenticated
  using ((select private.has_any_permission(organization_id, 'configuracoes.gerenciar', 'expedicao.gerenciar')))
  with check ((select private.has_any_permission(organization_id, 'configuracoes.gerenciar', 'expedicao.gerenciar')));
create policy "Excluir modelos de etiqueta" on public.label_templates for delete to authenticated
  using ((select private.has_any_permission(organization_id, 'configuracoes.gerenciar', 'expedicao.gerenciar')));

revoke all on public.label_templates from anon;

-- -----------------------------------------------------------------------------
-- Imagens dos modelos (logo, arte de fundo): bucket privado, pasta = gráfica
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('etiquetas', 'etiquetas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Ler imagens de etiquetas da gráfica" on storage.objects for select to authenticated
  using (
    bucket_id = 'etiquetas'
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'pedidos.ver', 'expedicao.ver', 'configuracoes.ver'))
  );
create policy "Enviar imagens de etiquetas da gráfica" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'etiquetas'
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'configuracoes.gerenciar', 'expedicao.gerenciar'))
  );
create policy "Apagar imagens de etiquetas da gráfica" on storage.objects for delete to authenticated
  using (
    bucket_id = 'etiquetas'
    and (select private.has_any_permission(((storage.foldername(name))[1])::uuid,
      'configuracoes.gerenciar', 'expedicao.gerenciar'))
  );

-- =============================================================================
-- "Reproduzir na TV" (como o botão do YouTube)
--   Qualquer pessoa da gráfica escolhe uma TV conectada e manda a tela que está
--   vendo (produção, prazos, artes, faturamento, estoque). A TV consulta o
--   comando a cada poucos segundos. "Parar" volta a girar as telas.
-- =============================================================================

alter table public.tv_devices
  add column cast_screen text check (cast_screen is null or cast_screen ~ '^[a-z_]{2,20}$'),
  add column cast_at timestamptz,
  add column cast_by text check (cast_by is null or char_length(cast_by) <= 120);

comment on column public.tv_devices.cast_screen is
  'Tela fixada pelo "Reproduzir na TV" (nulo = gira entre as telas).';

-- TVs da gráfica para o "Reproduzir na TV" (sem o token: só nome e situação).
create or replace function public.tv_cast_targets(p_org uuid)
returns table (id uuid, name text, last_seen_at timestamptz, cast_screen text, revoked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.last_seen_at, d.cast_screen, d.revoked_at is not null
  from public.tv_devices d
  where d.organization_id = p_org and (select private.is_member(p_org))
  order by d.revoked_at nulls first, d.name
$$;

-- Manda (ou para) a reprodução numa TV da gráfica de quem chama.
create or replace function public.tv_cast(p_device uuid, p_screen text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.tv_devices where id = p_device and revoked_at is null;
  if v_org is null or not (select private.is_member(v_org)) then
    raise exception 'TV não encontrada ou desligada.' using errcode = 'P0002';
  end if;
  if p_screen is not null and p_screen !~ '^[a-z_]{2,20}$' then
    raise exception 'Tela inválida.' using errcode = '22023';
  end if;
  update public.tv_devices
  set cast_screen = p_screen,
      cast_at = now(),
      cast_by = (select p.full_name from public.profiles p where p.id = (select auth.uid()))
  where id = p_device;
end;
$$;

-- Comando atual para a TV (só o servidor chama, com o token da TV).
create or replace function public.tv_command(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.tv_devices;
begin
  select * into d from public.tv_devices where token = p_token;
  if d.id is null or d.revoked_at is not null then
    return jsonb_build_object('active', false);
  end if;
  -- "Ligada agora" na lista: marca a presença sem gravar a cada consulta.
  if d.last_seen_at is null or d.last_seen_at < now() - interval '30 seconds' then
    update public.tv_devices set last_seen_at = now() where id = d.id;
  end if;
  return jsonb_build_object('active', true, 'screen', d.cast_screen, 'at', d.cast_at, 'by', d.cast_by);
end;
$$;

revoke all on function public.tv_cast_targets(uuid) from public, anon;
revoke all on function public.tv_cast(uuid, text) from public, anon;
revoke all on function public.tv_command(text) from public, anon, authenticated;
grant execute on function public.tv_cast_targets(uuid) to authenticated;
grant execute on function public.tv_cast(uuid, text) to authenticated;
grant execute on function public.tv_command(text) to service_role;

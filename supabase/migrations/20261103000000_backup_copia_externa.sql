-- Cópia externa dos backups (Cloudflare R2): situação de cada cópia, para a Plataforma mostrar.

alter table public.platform_backups
  add column offsite_status text check (offsite_status is null or offsite_status in ('copiado', 'erro')),
  add column offsite_error text check (offsite_error is null or char_length(offsite_error) <= 500);

comment on column public.platform_backups.offsite_status is
  'Cópia no Cloudflare R2: copiado, erro ou nulo (sem R2 configurado).';

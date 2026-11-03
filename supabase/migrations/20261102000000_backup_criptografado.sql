-- Backups criptografados (AES-256-GCM) com a chave BACKUP_ENCRYPTION_KEY do servidor.
-- Aqui fica só se o arquivo está criptografado e a impressão da chave (não a chave).

alter table public.platform_backups
  add column encrypted boolean not null default false,
  add column key_fingerprint text check (key_fingerprint is null or key_fingerprint ~ '^[0-9a-f]{16}$');

comment on column public.platform_backups.key_fingerprint is
  'Impressão (SHA-256, 8 bytes) da chave que criptografou o arquivo. Identifica a chave sem revelá-la.';

-- O arquivo criptografado não é gzip puro: o bucket passa a aceitar binário genérico.
update storage.buckets
   set allowed_mime_types = array['application/gzip', 'application/octet-stream']
 where id = 'backups';

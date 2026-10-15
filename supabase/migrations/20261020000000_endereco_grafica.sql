-- =============================================================================
-- Endereço e telefone da gráfica: remetente da etiqueta de envio dos pedidos
-- de balcão e WhatsApp (os da Shopee usam a etiqueta oficial da Shopee).
-- =============================================================================

alter table public.organizations
  add column phone text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  add column cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  add column street text check (street is null or char_length(street) <= 160),
  add column number text check (number is null or char_length(number) <= 20),
  add column complement text check (complement is null or char_length(complement) <= 80),
  add column district text check (district is null or char_length(district) <= 80),
  add column city text check (city is null or char_length(city) <= 80),
  add column state text check (state is null or state ~ '^[A-Z]{2}$');

comment on column public.organizations.cep is 'Endereço da gráfica (remetente nas etiquetas de envio).';

drop index if exists public.transfers_provider_external_idx;

alter table public.transfers
  drop constraint if exists transfers_provider_external_key;

alter table public.transfers
  add constraint transfers_provider_external_key
  unique(provider, provider_external_id);

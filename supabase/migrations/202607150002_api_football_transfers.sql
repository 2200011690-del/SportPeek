alter table public.transfers
  add column if not exists provider text,
  add column if not exists provider_external_id text,
  add column if not exists raw_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists transfers_provider_external_idx
  on public.transfers(provider, provider_external_id)
  where provider is not null and provider_external_id is not null;

drop policy if exists "content cache read" on public.transfers;
create policy "content cache read" on public.transfers
  for select to anon, authenticated using (true);

grant select on public.transfers to anon, authenticated;

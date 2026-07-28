create table if not exists public.match_provider_details (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  provider text not null,
  lineups jsonb not null default '[]'::jsonb,
  injuries jsonb not null default '[]'::jsonb,
  player_statistics jsonb not null default '[]'::jsonb,
  prediction jsonb,
  head_to_head jsonb not null default '[]'::jsonb,
  source_timestamp timestamptz,
  updated_at timestamptz not null default now(),
  unique(match_id, provider)
);

create index if not exists match_provider_details_match_idx
  on public.match_provider_details(match_id, updated_at desc);

alter table public.match_provider_details enable row level security;
drop policy if exists "content cache read" on public.match_provider_details;
create policy "content cache read" on public.match_provider_details
  for select to anon, authenticated using (true);

grant select on public.match_provider_details to anon, authenticated;

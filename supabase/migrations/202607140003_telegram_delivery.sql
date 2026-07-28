alter table public.telegram_connections
  add column if not exists last_update_id bigint,
  add column if not exists stopped_at timestamptz;

create table if not exists public.telegram_updates (
  update_id bigint primary key,
  telegram_chat_id text,
  command text,
  status text not null default 'processing' check (status in ('processing','completed','ignored','failed')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('telegram')),
  notification_type text not null check (notification_type in ('breaking_news','match_start','match_result','transfer','daily_digest')),
  reference_id text not null,
  version_key text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','suppressed')),
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(user_id, channel, notification_type, reference_id, version_key)
);

create index if not exists notification_deliveries_user_created_idx on public.notification_deliveries(user_id, created_at desc);
create index if not exists notification_deliveries_status_idx on public.notification_deliveries(status, created_at) where status in ('pending','failed');

alter table public.telegram_updates enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "members read own deliveries" on public.notification_deliveries;
create policy "members read own deliveries" on public.notification_deliveries for select to authenticated using (user_id = auth.uid() and public.is_internal_member());

grant select on public.notification_deliveries to authenticated;

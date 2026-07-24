alter table public.telegram_connections add column if not exists verification_expires_at timestamptz;
create index if not exists telegram_connections_verification_idx on public.telegram_connections(verification_code, verification_expires_at) where verification_code is not null;

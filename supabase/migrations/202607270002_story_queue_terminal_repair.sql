-- Retain exhausted articles for audit without leaving them in an unclaimable
-- pending state. The claim RPC accepts only processing_attempts < 5.

update public.raw_articles
set
  processing_status = 'failed',
  processing_job_id = null,
  processing_claimed_at = null,
  processing_lease_expires_at = null,
  processing_retry_after = null,
  processing_error = left(
    concat_ws(
      ' | ',
      nullif(processing_error, ''),
      'Retry limit reached; retained for audit.'
    ),
    1000
  )
where processing_status = 'pending'
  and processing_attempts >= 5;

alter table public.raw_articles
  drop constraint if exists raw_articles_pending_attempts_check;

alter table public.raw_articles
  add constraint raw_articles_pending_attempts_check
  check (
    processing_status <> 'pending'
    or processing_attempts < 5
  )
  not valid;

alter table public.raw_articles
  validate constraint raw_articles_pending_attempts_check;

comment on constraint raw_articles_pending_attempts_check
on public.raw_articles is
  'Prevents exhausted story-processing rows from becoming permanently pending.';

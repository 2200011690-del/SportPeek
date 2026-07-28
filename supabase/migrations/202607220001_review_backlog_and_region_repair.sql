-- Keep the free remote-AI budget focused on multi-source and fresh stories.
update public.story_clusters
set
  review_status = 'reviewed',
  payload = jsonb_set(payload, '{reviewStatus}', '"reviewed"'::jsonb, true)
where review_status = 'pending'
  and ai_generated = false
  and (
    coalesce(nullif(payload ->> 'sourceCount', '')::integer, 0) <= 1
    or last_updated_at < now() - interval '48 hours'
  );

-- Older payloads defaulted every geography-free story to international. Use
-- the publisher country as the safe fallback until the story is reprocessed.
update public.story_clusters
set
  region = case
    when coalesce(payload ->> 'publisherCountry', '') = 'Việt Nam' then 'Việt Nam'
    else 'Thế giới'
  end,
  payload = jsonb_set(
    payload,
    '{region}',
    to_jsonb(
      case
        when coalesce(payload ->> 'publisherCountry', '') = 'Việt Nam' then 'Việt Nam'
        else 'Thế giới'
      end
    ),
    true
  )
where geography is null
  and coalesce(region, '') in ('', 'Quốc tế');

-- Keep the searchable columns synchronized with the current story payload.
-- AI summaries can rewrite a title after the initial cluster insert, so this
-- database trigger protects every writer (Worker, scripts, and future clients).

create or replace function public.refresh_story_cluster_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  payload_source_names text := '';
  payload_article_titles text := '';
  searchable text;
begin
  select coalesce(string_agg(value, ' '), '')
    into payload_source_names
  from jsonb_array_elements_text(
    coalesce(new.payload->'sourceNames', '[]'::jsonb)
  ) as value;

  select coalesce(string_agg(article->>'title', ' '), '')
    into payload_article_titles
  from jsonb_array_elements(
    coalesce(new.payload->'articles', '[]'::jsonb)
  ) as article;

  searchable := concat_ws(
    ' ',
    coalesce(nullif(new.payload->>'title', ''), new.title, ''),
    coalesce(nullif(new.payload->>'summary', ''), new.summary, ''),
    coalesce(nullif(new.payload->>'category', ''), new.category, ''),
    coalesce(new.payload->>'geography', ''),
    coalesce(new.payload->>'region', ''),
    coalesce(payload_source_names, array_to_string(new.source_names, ' '), ''),
    payload_article_titles
  );

  new.search_text := trim(
    lower(
      regexp_replace(
        translate(
          lower(searchable),
          'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
          'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists story_clusters_refresh_search_text
  on public.story_clusters;

create trigger story_clusters_refresh_search_text
before insert or update of title, summary, category, source_names, payload
on public.story_clusters
for each row
execute function public.refresh_story_cluster_search_text();

-- Repair rows whose payload was updated by AI before the trigger existed.
-- Updating these mirrored columns also invokes the trigger and rebuilds the
-- index from the current AI title plus all original article titles.
update public.story_clusters
set
  title = coalesce(nullif(payload->>'title', ''), title),
  summary = coalesce(nullif(payload->>'summary', ''), summary),
  category = coalesce(nullif(payload->>'category', ''), category),
  source_names = case
    when jsonb_typeof(payload->'sourceNames') = 'array' then array(
      select jsonb_array_elements_text(payload->'sourceNames')
    )
    else source_names
  end;

grant execute on function public.refresh_story_cluster_search_text()
  to service_role;

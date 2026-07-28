-- Migration: 202607200001_search_text_backfill
-- Ensure search_text is populated for all rows in story_clusters

update public.story_clusters
set search_text = lower(
  regexp_replace(
    translate(
      lower(
        payload->>'title' || ' ' || 
        coalesce(payload->>'summary', '') || ' ' || 
        coalesce(payload->>'category', '') || ' ' ||
        coalesce((
          select string_agg(val, ' ') 
          from jsonb_array_elements_text(coalesce(payload->'sourceNames', '[]'::jsonb)) as val
        ), '')
      ),
      'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydd'
    ),
    '[^a-z0-9]+', ' ', 'g'
  )
)
where search_text is null or search_text = '';

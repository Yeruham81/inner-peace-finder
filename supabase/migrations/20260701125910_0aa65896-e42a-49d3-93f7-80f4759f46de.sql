
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS bio_raw text,
  ADD COLUMN IF NOT EXISTS semantic_profile jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS therapists_semantic_profile_gin
  ON public.therapists USING gin (semantic_profile);

ALTER TABLE public.semantic_search_logs
  ADD COLUMN IF NOT EXISTS avg_semantic_similarity_score numeric;

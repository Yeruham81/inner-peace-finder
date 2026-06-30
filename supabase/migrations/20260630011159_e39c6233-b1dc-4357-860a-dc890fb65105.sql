
-- Phase 3: Eligibility + ranking extensions
INSERT INTO public.population_groups (slug, name, sort_order) VALUES
  ('infants', 'תינוקות ופעוטות (0-4)', 0),
  ('couples', 'זוגות', 6)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.semantic_search_logs
  ADD COLUMN IF NOT EXISTS pre_rank_candidates_count integer,
  ADD COLUMN IF NOT EXISTS filtered_therapist_count integer,
  ADD COLUMN IF NOT EXISTS final_results_count integer;

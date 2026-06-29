
CREATE TABLE public.semantic_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_query text,
  normalized_query text,
  cache_hit boolean NOT NULL DEFAULT false,
  classifier_source text,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  clarification_shown boolean NOT NULL DEFAULT false,
  clarification_selected boolean NOT NULL DEFAULT false,
  selected_problem_slug text,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.semantic_search_logs TO anon, authenticated;
GRANT ALL ON public.semantic_search_logs TO service_role;

ALTER TABLE public.semantic_search_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) may write a log row from the
-- semantic pipeline. Reads are service-role only.
CREATE POLICY "Anyone can insert semantic search logs"
ON public.semantic_search_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE INDEX semantic_search_logs_created_at_idx
  ON public.semantic_search_logs (created_at DESC);
CREATE INDEX semantic_search_logs_normalized_query_idx
  ON public.semantic_search_logs (normalized_query);

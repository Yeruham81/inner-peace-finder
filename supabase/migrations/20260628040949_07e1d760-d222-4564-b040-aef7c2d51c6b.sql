
CREATE TABLE public.query_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_query text NOT NULL UNIQUE,
  result jsonb NOT NULL,
  source text NOT NULL DEFAULT 'mock',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.query_classifications TO anon, authenticated;
GRANT ALL ON public.query_classifications TO service_role;

ALTER TABLE public.query_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read query classifications"
  ON public.query_classifications FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX idx_query_classifications_created_at
  ON public.query_classifications (created_at DESC);

-- 1) Add cta_id column for finer-grained dedupe (defaults to 'primary' for existing rows)
ALTER TABLE public.cta_clicks
  ADD COLUMN IF NOT EXISTS cta_id text NOT NULL DEFAULT 'primary';

ALTER TABLE public.cta_clicks
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;

-- 2) Deduplicate any pre-existing rows that would violate the new unique index.
--    Keep the earliest row per (session_id, therapist_id, cta_id).
DELETE FROM public.cta_clicks a
USING public.cta_clicks b
WHERE a.ctid <> b.ctid
  AND a.session_id = b.session_id
  AND a.therapist_id = b.therapist_id
  AND a.cta_id = b.cta_id
  AND a.created_at > b.created_at;

-- 3) Hard uniqueness guarantee — single source of truth for billing.
CREATE UNIQUE INDEX IF NOT EXISTS cta_clicks_session_therapist_cta_unique
  ON public.cta_clicks (session_id, therapist_id, cta_id);

-- Useful supporting index for lookups
CREATE INDEX IF NOT EXISTS cta_clicks_therapist_created_idx
  ON public.cta_clicks (therapist_id, created_at DESC);

-- 4) Atomic billing-safe insert. First writer wins via ON CONFLICT DO NOTHING.
--    Returns billable=true only when this call actually inserted the row.
CREATE OR REPLACE FUNCTION public.record_cta_click(
  _therapist_id uuid,
  _session_id text,
  _cta_id text DEFAULT 'primary',
  _source_problem_id uuid DEFAULT NULL,
  _ip_hash text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS TABLE (billable boolean, already_exists boolean, click_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_id uuid;
BEGIN
  INSERT INTO public.cta_clicks
    (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
  VALUES
    (_therapist_id, _session_id, _cta_id, _source_problem_id, _ip_hash, _user_agent, true)
  ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT true, false, inserted_id;
  ELSE
    RETURN QUERY
      SELECT false, true, c.id
      FROM public.cta_clicks c
      WHERE c.session_id = _session_id
        AND c.therapist_id = _therapist_id
        AND c.cta_id = _cta_id
      LIMIT 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) TO anon, authenticated, service_role;

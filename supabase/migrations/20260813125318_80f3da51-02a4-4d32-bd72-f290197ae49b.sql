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
  -- Canonical public-eligibility guard: no CTA event may be created for a
  -- missing or ineligible therapist.
  IF NOT EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
  ) THEN
    RETURN;
  END IF;

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
REVOKE EXECUTE ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) TO service_role;
BEGIN;

-- Keep the existing signature so generated types and deployed callers remain
-- compatible. Caller-side AMD is intentionally disabled: once the visitor leg
-- is technically answered, the therapist leg may be created immediately.
CREATE OR REPLACE FUNCTION public.voice_call_caller_answered(
  _parent_call_sid text,
  _amd_result text
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  attempt_id uuid,
  therapist_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_session public.voice_call_sessions;
  v_therapist public.therapists;
BEGIN
  SELECT * INTO v_session
    FROM public.voice_call_sessions AS session
    WHERE session.parent_call_sid = _parent_call_sid
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown_call', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  UPDATE public.voice_call_sessions
    SET caller_leg_status = 'in-progress',
        caller_amd_result = 'disabled',
        caller_answered_at = coalesce(caller_answered_at, pg_catalog.now())
    WHERE id = v_session.id;

  -- Re-check eligibility at answer time. This remains the only gate before a
  -- private therapist number is returned to the trusted TwiML handler.
  SELECT * INTO v_therapist
    FROM public.therapists AS therapist
    WHERE therapist.id = v_session.therapist_id
      AND therapist.is_active = true
      AND therapist.profile_status = 'published'
      AND therapist.visibility IN ('visible', 'published')
      AND therapist.do_not_republish = false
      AND (therapist.profile_origin <> 'admin_public_info' OR therapist.owner_account_id IS NOT NULL)
      AND 'phone' = ANY(coalesce(therapist.contact_methods, ARRAY[]::text[]))
      AND coalesce(pg_catalog.btrim(therapist.phone), '') <> '';
  IF NOT FOUND THEN
    UPDATE public.voice_call_sessions
      SET outcome = coalesce(outcome, 'rejected')
      WHERE id = v_session.id AND billable_event_at IS NULL;
    RETURN QUERY SELECT false, 'therapist_unavailable', v_session.id, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT true, 'accepted', v_session.id, pg_catalog.btrim(v_therapist.phone);
END;
$fn$;

REVOKE ALL ON FUNCTION public.voice_call_caller_answered(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voice_call_caller_answered(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_call_caller_answered(text, text) TO service_role;

COMMIT;

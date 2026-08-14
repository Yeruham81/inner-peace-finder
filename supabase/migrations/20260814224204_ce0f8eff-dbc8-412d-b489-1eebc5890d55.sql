BEGIN;

-- Atomic challenge issuance: purge + per-IP issuance limit + insert, serialized
-- per IP hash by a transaction-scoped advisory lock.
CREATE OR REPLACE FUNCTION public.issue_lead_challenge(
  _ip_hash text,
  _prompt text,
  _expected integer,
  _ttl_seconds integer DEFAULT 600,
  _issue_limit integer DEFAULT 20,
  _window_seconds integer DEFAULT 900
)
RETURNS TABLE(allowed boolean, reason text, challenge_id uuid, prompt text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  issued integer;
  row_out public.lead_challenges;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' THEN
    RAISE EXCEPTION 'ip hash is required';
  END IF;

  -- Serialize concurrent issuance for this IP hash inside the transaction so
  -- the count below cannot be raced by parallel requests.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('lead_challenge:' || _ip_hash));

  DELETE FROM public.lead_challenges
    WHERE created_at < pg_catalog.now() - pg_catalog.make_interval(hours => 24);

  SELECT count(*) INTO issued
    FROM public.lead_challenges c
    WHERE c.ip_hash = _ip_hash
      AND c.created_at >= pg_catalog.now() - pg_catalog.make_interval(secs => _window_seconds);

  IF issued >= _issue_limit THEN
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.lead_challenges (prompt, expected_answer, ip_hash, expires_at)
    VALUES (_prompt, _expected, _ip_hash,
            pg_catalog.now() + pg_catalog.make_interval(secs => _ttl_seconds))
    RETURNING * INTO row_out;

  RETURN QUERY SELECT true, 'issued', row_out.id, row_out.prompt, row_out.expires_at;
END;
$fn$;

REVOKE ALL ON FUNCTION public.issue_lead_challenge(text, text, integer, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_lead_challenge(text, text, integer, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_lead_challenge(text, text, integer, integer, integer, integer) TO service_role;

-- Authorization: same signature, now fully atomic per IP hash and additionally
-- enforcing the session-level distinct-therapist velocity limit that previously
-- ran in application code outside the transaction.
CREATE OR REPLACE FUNCTION public.authorize_lead_submission(
  _challenge_id uuid,
  _answer integer,
  _ip_hash text,
  _session_hash text,
  _therapist_id uuid
)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
DECLARE
  ip_window timestamptz := now() - interval '15 minutes';
  therapist_window timestamptz := now() - interval '1 hour';
  attempt_count integer;
  distinct_therapists integer;
  session_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  outcome text;
BEGIN
  -- Serialize everything below per IP hash: counting and the recording of this
  -- attempt now happen inside one transaction that no parallel request can
  -- interleave with.
  PERFORM pg_advisory_xact_lock(hashtext('lead_submit:' || coalesce(_ip_hash, '')));

  SELECT count(*) INTO attempt_count
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash AND a.created_at >= ip_window;
  IF attempt_count >= 10 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded';
    RETURN;
  END IF;

  SELECT count(DISTINCT a.therapist_id) INTO distinct_therapists
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.created_at >= ip_window
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF distinct_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded';
    RETURN;
  END IF;

  -- Session-level velocity: at most 5 distinct therapists contacted per session
  -- inside the same 15 minute window.
  SELECT count(DISTINCT a.therapist_id) INTO session_therapists
    FROM public.lead_submission_attempts a
    WHERE a.session_hash = _session_hash
      AND a.created_at >= ip_window
      AND a.outcome = 'accepted'
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF session_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded';
    RETURN;
  END IF;

  SELECT count(*) INTO accepted_same
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.therapist_id = _therapist_id
      AND a.outcome = 'accepted'
      AND a.created_at >= therapist_window;
  IF accepted_same >= 3 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded';
    RETURN;
  END IF;

  SELECT * INTO challenge FROM public.lead_challenges c
    WHERE c.id = _challenge_id
    FOR UPDATE;

  IF NOT FOUND THEN
    outcome := 'challenge_failed';
  ELSIF challenge.consumed_at IS NOT NULL THEN
    outcome := 'challenge_expired';
  ELSIF challenge.expires_at <= now() THEN
    outcome := 'challenge_expired';
  ELSIF challenge.ip_hash IS DISTINCT FROM _ip_hash THEN
    outcome := 'challenge_failed';
  ELSIF challenge.expected_answer IS DISTINCT FROM _answer THEN
    outcome := 'challenge_failed';
  ELSE
    UPDATE public.lead_challenges
      SET consumed_at = now()
      WHERE id = challenge.id;
    outcome := 'accepted';
  END IF;

  INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    VALUES (_ip_hash, _session_hash, _therapist_id, outcome);

  IF outcome = 'accepted' THEN
    RETURN QUERY SELECT true, 'accepted';
  ELSE
    RETURN QUERY SELECT false, outcome;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) TO service_role;

COMMIT;
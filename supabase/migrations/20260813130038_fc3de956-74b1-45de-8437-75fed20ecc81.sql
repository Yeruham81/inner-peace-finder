-- Phase: server-issued lead challenge + DB-backed IP rate limiting

CREATE TABLE public.lead_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  expected_answer integer NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL
);

CREATE TABLE public.lead_submission_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  session_hash text NOT NULL,
  therapist_id uuid NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Private tables: no anon/authenticated access whatsoever.
REVOKE ALL ON public.lead_challenges FROM anon, authenticated;
REVOKE ALL ON public.lead_submission_attempts FROM anon, authenticated;
GRANT ALL ON public.lead_challenges TO service_role;
GRANT ALL ON public.lead_submission_attempts TO service_role;

ALTER TABLE public.lead_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_submission_attempts ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service_role (BYPASSRLS via API key) may read/write.

CREATE INDEX idx_lead_challenges_ip_created ON public.lead_challenges (ip_hash, created_at DESC);
CREATE INDEX idx_lead_challenges_created ON public.lead_challenges (created_at);
CREATE INDEX idx_lead_attempts_ip_created ON public.lead_submission_attempts (ip_hash, created_at DESC);
CREATE INDEX idx_lead_attempts_session_created ON public.lead_submission_attempts (session_hash, created_at DESC);
CREATE INDEX idx_lead_attempts_therapist_created ON public.lead_submission_attempts (therapist_id, created_at DESC);

-- Atomic challenge consumption + IP rate limiting.
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
SET search_path = public
AS $$
DECLARE
  ip_window timestamptz := now() - interval '15 minutes';
  therapist_window timestamptz := now() - interval '1 hour';
  attempt_count integer;
  distinct_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  outcome text;
BEGIN
  -- 1) IP-based limits (evaluated before touching the challenge row).
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

  -- 2) Atomically claim the challenge row; concurrent callers serialize here.
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
$$;

REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_lead_submission(uuid, integer, text, text, uuid) TO service_role;

-- Housekeeping: drop expired challenge rows older than 24h.
CREATE OR REPLACE FUNCTION public.purge_expired_lead_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.lead_challenges
    WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role;
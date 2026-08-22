-- Voice-call (phone channel) infrastructure.
-- Private by design: no anon/authenticated grants, RLS on with no policies,
-- all mutations flow through SECURITY DEFINER functions granted to service_role.

CREATE TABLE IF NOT EXISTS public.voice_call_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.lead_events(id) ON DELETE SET NULL,
  cta_event_id uuid REFERENCES public.cta_clicks(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  ip_hash text NOT NULL,
  caller_hash text NOT NULL,
  parent_call_sid text,
  child_call_sid text,
  caller_leg_status text NOT NULL DEFAULT 'pending',
  caller_amd_result text,
  therapist_leg_status text,
  outcome text,
  billable_eligible boolean NOT NULL DEFAULT false,
  billable_event_at timestamptz,
  provider_error_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  caller_answered_at timestamptz,
  therapist_answered_at timestamptz,
  connected_at timestamptz,
  completed_at timestamptz,
  connected_duration_seconds integer,
  last_caller_sequence integer,
  last_therapist_sequence integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_call_sessions_caller_leg_status_check
    CHECK (caller_leg_status IN ('pending','initiated','ringing','in-progress','completed','busy','no-answer','failed','canceled')),
  CONSTRAINT voice_call_sessions_therapist_leg_status_check
    CHECK (therapist_leg_status IS NULL OR therapist_leg_status IN ('initiated','ringing','in-progress','answered','completed','busy','no-answer','failed','canceled')),
  CONSTRAINT voice_call_sessions_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('answered','unanswered','visitor_no_answer','visitor_machine','provider_error','rejected')),
  CONSTRAINT voice_call_sessions_duration_check
    CHECK (connected_duration_seconds IS NULL OR connected_duration_seconds >= 0)
);

-- Locked down: no Data API access for anon/authenticated, service_role only.
REVOKE ALL ON TABLE public.voice_call_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.voice_call_sessions FROM anon, authenticated;
GRANT ALL ON TABLE public.voice_call_sessions TO service_role;
ALTER TABLE public.voice_call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_call_sessions FORCE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS voice_call_sessions_parent_sid_unique
  ON public.voice_call_sessions (parent_call_sid) WHERE parent_call_sid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS voice_call_sessions_child_sid_unique
  ON public.voice_call_sessions (child_call_sid) WHERE child_call_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS voice_call_sessions_ip_recent_idx
  ON public.voice_call_sessions (ip_hash, requested_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_sessions_caller_recent_idx
  ON public.voice_call_sessions (caller_hash, requested_at DESC);
CREATE INDEX IF NOT EXISTS voice_call_sessions_therapist_idx
  ON public.voice_call_sessions (therapist_id, requested_at DESC);

DROP TRIGGER IF EXISTS voice_call_sessions_set_updated_at ON public.voice_call_sessions;
CREATE TRIGGER voice_call_sessions_set_updated_at
  BEFORE UPDATE ON public.voice_call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 1) Attempt creation: challenge, voice rate limits, eligibility, claim gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_voice_call_attempt(
  _challenge_id uuid,
  _answer integer,
  _ip_hash text,
  _session_hash text,
  _session_id text,
  _caller_hash text,
  _therapist_id uuid
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  attempt_id uuid,
  therapist_phone text,
  therapist_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  ip_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(mins => 15);
  challenge public.lead_challenges;
  v_therapist public.therapists;
  v_count integer;
  v_id uuid;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' OR _caller_hash IS NULL OR _caller_hash = ''
     OR _session_hash IS NULL OR _session_hash = '' THEN
    RAISE EXCEPTION 'identity hashes are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('voice_call_ip:' || _ip_hash));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('voice_call_caller:' || _caller_hash));

  SELECT pg_catalog.count(*) INTO v_count
    FROM public.voice_call_sessions s
    WHERE s.ip_hash = _ip_hash AND s.requested_at >= ip_window;
  IF v_count >= 5 THEN
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
    FROM public.voice_call_sessions s
    WHERE s.caller_hash = _caller_hash AND s.requested_at >= ip_window;
  IF v_count >= 3 THEN
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO v_count
    FROM public.voice_call_sessions s
    WHERE s.caller_hash = _caller_hash
      AND s.therapist_id = _therapist_id
      AND s.outcome IS NULL
      AND s.requested_at >= pg_catalog.now() - pg_catalog.make_interval(mins => 10);
  IF v_count > 0 THEN
    RETURN QUERY SELECT false, 'active_attempt_exists', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Single-use, IP-bound, expiring challenge (same rules as written leads).
  SELECT * INTO challenge FROM public.lead_challenges c WHERE c.id = _challenge_id FOR UPDATE;
  IF NOT FOUND
     OR challenge.ip_hash IS DISTINCT FROM _ip_hash
     OR challenge.expected_answer IS DISTINCT FROM _answer THEN
    RETURN QUERY SELECT false, 'challenge_failed', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;
  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= pg_catalog.now() THEN
    RETURN QUERY SELECT false, 'challenge_expired', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Canonical public eligibility, re-checked server-side at call time.
  SELECT * INTO v_therapist
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
    FOR UPDATE;
  IF NOT FOUND OR v_therapist.do_not_republish THEN
    RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Live calls are never placed to ownerless Tipulinks-created profiles; those
  -- keep the held-inquiry + claim-invitation path only.
  IF v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'unclaimed_profile', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF NOT ('phone' = ANY(coalesce(v_therapist.contact_methods, ARRAY[]::text[])))
     OR coalesce(pg_catalog.btrim(v_therapist.phone), '') = '' THEN
    RETURN QUERY SELECT false, 'channel_unavailable', NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.lead_challenges SET consumed_at = pg_catalog.now() WHERE id = challenge.id;

  INSERT INTO public.voice_call_sessions
      (therapist_id, session_id, ip_hash, caller_hash, caller_leg_status)
    VALUES (_therapist_id, _session_id, _ip_hash, _caller_hash, 'pending')
    RETURNING id INTO v_id;

  RETURN QUERY SELECT true, 'accepted', v_id,
                      pg_catalog.btrim(v_therapist.phone), v_therapist.full_name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.start_voice_call_attempt(uuid, integer, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_voice_call_attempt(uuid, integer, text, text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_voice_call_attempt(uuid, integer, text, text, text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Provider bookkeeping for the created visitor leg.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_voice_call_provider(
  _attempt_id uuid,
  _parent_call_sid text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.voice_call_sessions
    SET parent_call_sid = _parent_call_sid,
        caller_leg_status = CASE WHEN caller_leg_status = 'pending' THEN 'initiated' ELSE caller_leg_status END
    WHERE id = _attempt_id AND parent_call_sid IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.attach_voice_call_provider(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_voice_call_provider(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_voice_call_provider(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_voice_call_attempt(
  _attempt_id uuid,
  _error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.voice_call_sessions
    SET outcome = coalesce(outcome, 'provider_error'),
        caller_leg_status = CASE WHEN caller_leg_status = 'pending' THEN 'failed' ELSE caller_leg_status END,
        provider_error_code = pg_catalog.left(coalesce(_error_code, 'unknown'), 64),
        completed_at = coalesce(completed_at, pg_catalog.now())
    WHERE id = _attempt_id AND billable_event_at IS NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fail_voice_call_attempt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_voice_call_attempt(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_voice_call_attempt(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Visitor answered: release the therapist number only for a human answer.
-- ---------------------------------------------------------------------------
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
  SELECT * INTO v_session FROM public.voice_call_sessions s
    WHERE s.parent_call_sid = _parent_call_sid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'unknown_call', NULL::uuid, NULL::text;
    RETURN;
  END IF;

  UPDATE public.voice_call_sessions
    SET caller_leg_status = 'in-progress',
        caller_amd_result = coalesce(_amd_result, caller_amd_result),
        caller_answered_at = coalesce(caller_answered_at, pg_catalog.now())
    WHERE id = v_session.id;

  -- Machine/fax/unknown visitor answers must never reach the therapist.
  IF coalesce(_amd_result, 'unknown') <> 'human' THEN
    UPDATE public.voice_call_sessions
      SET outcome = coalesce(outcome, 'visitor_machine')
      WHERE id = v_session.id AND billable_event_at IS NULL;
    RETURN QUERY SELECT false, 'visitor_not_human', v_session.id, NULL::text;
    RETURN;
  END IF;

  -- Eligibility is re-checked here too: nothing is dialed for a profile that
  -- became ineligible between initiation and answer.
  SELECT * INTO v_therapist FROM public.therapists t
    WHERE t.id = v_session.therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
      AND t.do_not_republish = false
      AND (t.profile_origin <> 'admin_public_info' OR t.owner_account_id IS NOT NULL)
      AND 'phone' = ANY(coalesce(t.contact_methods, ARRAY[]::text[]))
      AND coalesce(pg_catalog.btrim(t.phone), '') <> '';
  IF NOT FOUND THEN
    UPDATE public.voice_call_sessions
      SET outcome = coalesce(outcome, 'rejected')
      WHERE id = v_session.id AND billable_event_at IS NULL;
    RETURN QUERY SELECT false, 'therapist_unavailable', v_session.id, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'accepted', v_session.id, pg_catalog.btrim(v_therapist.phone);
END;
$fn$;

REVOKE ALL ON FUNCTION public.voice_call_caller_answered(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voice_call_caller_answered(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_call_caller_answered(text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Idempotent, monotonic leg-status recording and one-time billable event.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_voice_call_leg_event(
  _parent_call_sid text,
  _child_call_sid text,
  _leg text,
  _status text,
  _sequence integer,
  _duration integer
)
RETURNS TABLE(
  handled boolean,
  billable_created boolean,
  attempt_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_session public.voice_call_sessions;
  v_therapist public.therapists;
  v_cta uuid;
  v_lead uuid;
  v_billable boolean := false;
  v_answered boolean;
BEGIN
  IF _leg NOT IN ('caller', 'therapist') THEN
    RAISE EXCEPTION 'unsupported leg';
  END IF;

  SELECT * INTO v_session FROM public.voice_call_sessions s
    WHERE s.parent_call_sid = _parent_call_sid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::uuid;
    RETURN;
  END IF;

  IF _leg = 'caller' THEN
    -- Out-of-order/replayed callbacks are dropped; visitor-leg events are
    -- never proof that the therapist leg answered and never bill.
    IF _sequence IS NOT NULL AND v_session.last_caller_sequence IS NOT NULL
       AND _sequence <= v_session.last_caller_sequence THEN
      RETURN QUERY SELECT false, false, v_session.id;
      RETURN;
    END IF;

    UPDATE public.voice_call_sessions
      SET last_caller_sequence = coalesce(_sequence, last_caller_sequence),
          caller_leg_status = _status,
          caller_answered_at = CASE WHEN _status = 'in-progress'
                                    THEN coalesce(caller_answered_at, pg_catalog.now())
                                    ELSE caller_answered_at END,
          completed_at = CASE WHEN _status IN ('completed','busy','no-answer','failed','canceled')
                              THEN coalesce(completed_at, pg_catalog.now()) ELSE completed_at END,
          outcome = CASE
            WHEN outcome IS NOT NULL THEN outcome
            WHEN _status IN ('busy','no-answer','failed','canceled') THEN 'visitor_no_answer'
            ELSE outcome END
      WHERE id = v_session.id;

    RETURN QUERY SELECT true, false, v_session.id;
    RETURN;
  END IF;

  IF _sequence IS NOT NULL AND v_session.last_therapist_sequence IS NOT NULL
     AND _sequence <= v_session.last_therapist_sequence THEN
    RETURN QUERY SELECT false, false, v_session.id;
    RETURN;
  END IF;

  -- 'answered'/'in-progress' prove an answer. A terminal 'completed' on the
  -- therapist leg authoritatively means the leg had been answered and serves
  -- as an idempotent fallback for a missing/late answered callback.
  v_answered := _status IN ('answered', 'in-progress', 'completed')
                OR v_session.therapist_answered_at IS NOT NULL;

  UPDATE public.voice_call_sessions
    SET last_therapist_sequence = coalesce(_sequence, last_therapist_sequence),
        child_call_sid = coalesce(child_call_sid, _child_call_sid),
        therapist_leg_status = _status,
        therapist_answered_at = CASE WHEN v_answered
                                     THEN coalesce(therapist_answered_at, pg_catalog.now())
                                     ELSE therapist_answered_at END,
        connected_at = CASE WHEN v_answered THEN coalesce(connected_at, pg_catalog.now()) ELSE connected_at END,
        completed_at = CASE WHEN _status IN ('completed','busy','no-answer','failed','canceled')
                            THEN coalesce(completed_at, pg_catalog.now()) ELSE completed_at END,
        connected_duration_seconds = coalesce(_duration, connected_duration_seconds),
        outcome = CASE
          WHEN v_answered THEN 'answered'
          WHEN outcome IS NOT NULL THEN outcome
          WHEN _status IN ('busy','no-answer','failed','canceled') THEN 'unanswered'
          ELSE outcome END
      WHERE id = v_session.id;

  IF NOT v_answered OR v_session.billable_event_at IS NOT NULL THEN
    RETURN QUERY SELECT true, false, v_session.id;
    RETURN;
  END IF;

  -- Exactly-once billable contact record for an answered therapist leg. Any
  -- answering party (person, receptionist, IVR or voicemail) counts.
  SELECT * INTO v_therapist FROM public.therapists t WHERE t.id = v_session.therapist_id;

  INSERT INTO public.cta_clicks (therapist_id, session_id, cta_id, ip_hash, billable)
    VALUES (v_session.therapist_id, v_session.session_id, 'voice_call', v_session.ip_hash, true)
    ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
    RETURNING id INTO v_cta;
  IF v_cta IS NULL THEN
    SELECT c.id INTO v_cta FROM public.cta_clicks c
      WHERE c.session_id = v_session.session_id
        AND c.therapist_id = v_session.therapist_id
        AND c.cta_id = 'voice_call'
      LIMIT 1;
  END IF;

  INSERT INTO public.lead_events (
    cta_event_id, session_id, therapist_id,
    visitor_name, visitor_phone, message,
    challenge_passed, delivery_channel, delivery_status
  ) VALUES (
    v_cta, v_session.session_id, v_session.therapist_id,
    'שיחה טלפונית', 'not_stored', 'שיחה טלפונית שחוברה דרך טיפולינקס',
    true, 'phone_call', 'connected'
  )
  RETURNING id INTO v_lead;

  UPDATE public.voice_call_sessions
    SET billable_eligible = true,
        billable_event_at = pg_catalog.now(),
        cta_event_id = v_cta,
        lead_id = v_lead
    WHERE id = v_session.id AND billable_event_at IS NULL;

  v_billable := true;
  RETURN QUERY SELECT true, v_billable, v_session.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_voice_call_leg_event(text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_voice_call_leg_event(text, text, text, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_voice_call_leg_event(text, text, text, text, integer, integer) TO service_role;
-- Tipulinks profile ownership / claim v2

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS profile_origin text NOT NULL DEFAULT 'self_created',
  ADD COLUMN IF NOT EXISTS owner_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_contact_reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_contact_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS participation_consent_source text,
  ADD COLUMN IF NOT EXISTS do_not_republish boolean NOT NULL DEFAULT false;

ALTER TABLE public.therapists DROP CONSTRAINT IF EXISTS therapists_profile_origin_check;
ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_profile_origin_check
  CHECK (profile_origin IN ('self_created','admin_public_info'));

ALTER TABLE public.therapists DROP CONSTRAINT IF EXISTS therapists_participation_consent_source_check;
ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_participation_consent_source_check
  CHECK (participation_consent_source IS NULL OR participation_consent_source IN ('claim_invite','self_signup','admin_recorded'));

ALTER TABLE public.therapists DROP CONSTRAINT IF EXISTS therapists_participation_consent_pair_check;
ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_participation_consent_pair_check
  CHECK ((participation_consent_at IS NULL) = (participation_consent_source IS NULL));

CREATE INDEX IF NOT EXISTS therapists_profile_origin_idx ON public.therapists(profile_origin);
CREATE INDEX IF NOT EXISTS therapists_do_not_republish_idx ON public.therapists(do_not_republish) WHERE do_not_republish = true;


CREATE OR REPLACE FUNCTION public.mark_therapist_as_admin_public_profile(_therapist_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  UPDATE public.therapists
    SET profile_origin='admin_public_info',
        profile_claimed=false,
        owner_reviewed_at=NULL,
        first_contact_reserved_at=NULL,
        first_contact_sent_at=NULL,
        participation_consent_at=NULL,
        participation_consent_source=NULL
    WHERE id=_therapist_id AND owner_account_id IS NULL AND do_not_republish=false;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile is owned, suppressed or missing'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_therapist_as_admin_public_profile(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_therapist_as_admin_public_profile(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.therapist_profile_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('claim_profile','remove_profile')),
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  requester_phone text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  verification_method text CHECK (verification_method IS NULL OR verification_method IN ('existing_email','existing_phone','manual_review')),
  request_ip_hash text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS therapist_profile_requests_open_email_key
  ON public.therapist_profile_requests (therapist_id, request_type, lower(requester_email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS therapist_profile_requests_created_idx
  ON public.therapist_profile_requests(created_at DESC);
ALTER TABLE public.therapist_profile_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.therapist_profile_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.therapist_profile_requests TO service_role;
DROP TRIGGER IF EXISTS trg_therapist_profile_requests_updated_at ON public.therapist_profile_requests;
CREATE TRIGGER trg_therapist_profile_requests_updated_at
  BEFORE UPDATE ON public.therapist_profile_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.therapist_claim_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by_account_id uuid REFERENCES public.therapist_accounts(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  sent_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS therapist_claim_invites_one_pending
  ON public.therapist_claim_invites(therapist_id) WHERE status = 'pending';
ALTER TABLE public.therapist_claim_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.therapist_claim_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.therapist_claim_invites TO service_role;
DROP TRIGGER IF EXISTS trg_therapist_claim_invites_updated_at ON public.therapist_claim_invites;
CREATE TRIGGER trg_therapist_claim_invites_updated_at
  BEFORE UPDATE ON public.therapist_claim_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_therapist_claim_invite(
  _therapist_id uuid, _email text, _token_hash text, _created_by uuid, _expires_at timestamptz
) RETURNS public.therapist_claim_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE t public.therapists; inv public.therapist_claim_invites;
BEGIN
  SELECT * INTO t FROM public.therapists WHERE id = _therapist_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'therapist not found'; END IF;
  IF t.owner_account_id IS NOT NULL OR t.profile_origin <> 'admin_public_info' OR t.do_not_republish THEN
    RAISE EXCEPTION 'profile is not claimable';
  END IF;
  IF t.email IS NULL OR lower(pg_catalog.btrim(t.email)) <> lower(pg_catalog.btrim(_email)) THEN
    RAISE EXCEPTION 'invite email must match the pre-existing profile email';
  END IF;
  IF t.first_contact_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'initial contact already used';
  END IF;
  UPDATE public.therapist_claim_invites
    SET status='expired'
    WHERE therapist_id=_therapist_id AND status='pending' AND expires_at <= pg_catalog.now();
  IF EXISTS (SELECT 1 FROM public.therapist_claim_invites WHERE therapist_id=_therapist_id AND status='pending') THEN
    RAISE EXCEPTION 'pending invite already exists';
  END IF;
  INSERT INTO public.therapist_claim_invites(therapist_id,email,token_hash,created_by,expires_at)
    VALUES(_therapist_id, lower(pg_catalog.btrim(_email)), _token_hash, _created_by, _expires_at)
    RETURNING * INTO inv;
  UPDATE public.therapists
    SET first_contact_reserved_at = coalesce(first_contact_reserved_at, pg_catalog.now())
    WHERE id = _therapist_id;
  RETURN inv;
END $fn$;
REVOKE ALL ON FUNCTION public.create_therapist_claim_invite(uuid,text,text,uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_therapist_claim_invite(uuid,text,text,uuid,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_therapist_claim_invite_sent(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE inv public.therapist_claim_invites; t public.therapists;
BEGIN
  SELECT * INTO inv FROM public.therapist_claim_invites WHERE id=_invite_id FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'pending' OR inv.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invite is not sendable';
  END IF;
  SELECT * INTO t FROM public.therapists WHERE id=inv.therapist_id FOR UPDATE;
  IF NOT FOUND OR t.owner_account_id IS NOT NULL OR t.do_not_republish THEN
    RAISE EXCEPTION 'profile is not contactable';
  END IF;
  IF t.first_contact_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'initial contact already used';
  END IF;
  UPDATE public.therapist_claim_invites SET sent_at=pg_catalog.now() WHERE id=inv.id;
  UPDATE public.therapists
    SET first_contact_reserved_at=coalesce(first_contact_reserved_at, pg_catalog.now()),
        first_contact_sent_at=pg_catalog.now()
    WHERE id=inv.therapist_id;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_therapist_claim_invite_sent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_therapist_claim_invite_sent(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_therapist_by_invite(
  _token_hash text, _auth_user_id uuid, _verified_email text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE inv public.therapist_claim_invites; acc public.therapist_accounts; t public.therapists;
BEGIN
  SELECT * INTO inv FROM public.therapist_claim_invites WHERE token_hash=_token_hash FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'pending' OR inv.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invite invalid or expired';
  END IF;
  IF lower(pg_catalog.btrim(inv.email)) <> lower(pg_catalog.btrim(_verified_email)) THEN
    RAISE EXCEPTION 'signed-in email does not match invite';
  END IF;
  SELECT * INTO acc FROM public.therapist_accounts WHERE auth_user_id=_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'therapist account not found'; END IF;
  SELECT * INTO t FROM public.therapists WHERE id=inv.therapist_id FOR UPDATE;
  IF NOT FOUND OR t.owner_account_id IS NOT NULL OR t.profile_origin <> 'admin_public_info' OR t.do_not_republish THEN
    RAISE EXCEPTION 'profile is not claimable';
  END IF;
  UPDATE public.therapists
    SET owner_account_id=acc.id,
        profile_claimed=true,
        owner_reviewed_at=NULL,
        participation_consent_at=pg_catalog.now(),
        participation_consent_source='claim_invite'
    WHERE id=t.id;
  UPDATE public.therapist_accounts SET account_status='claimed', onboarding_completed=false WHERE id=acc.id;
  UPDATE public.therapist_claim_invites SET status='accepted', accepted_by_account_id=acc.id, accepted_at=pg_catalog.now()
    WHERE id=inv.id;
  UPDATE public.therapist_profile_requests
    SET status='approved', verification_method='existing_email', reviewed_at=pg_catalog.now()
    WHERE therapist_id=t.id AND request_type='claim_profile' AND status='pending'
      AND lower(requester_email)=lower(inv.email);
  RETURN t.id;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_therapist_by_invite(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_therapist_by_invite(text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_therapist_profile_removal(
  _request_id uuid, _reviewer uuid, _verification_method text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE req public.therapist_profile_requests;
BEGIN
  IF _verification_method NOT IN ('existing_email','existing_phone','manual_review') THEN
    RAISE EXCEPTION 'invalid verification method';
  END IF;
  SELECT * INTO req FROM public.therapist_profile_requests WHERE id=_request_id FOR UPDATE;
  IF NOT FOUND OR req.request_type <> 'remove_profile' OR req.status <> 'pending' THEN
    RAISE EXCEPTION 'removal request is not pending';
  END IF;
  UPDATE public.therapists
    SET visibility='hidden_by_owner', is_active=false, do_not_republish=true
    WHERE id=req.therapist_id;
  UPDATE public.therapist_claim_invites
    SET status='revoked', revoked_at=pg_catalog.now()
    WHERE therapist_id=req.therapist_id AND status='pending';
  UPDATE public.therapist_profile_requests
    SET status='approved', verification_method=_verification_method, reviewed_by=_reviewer, reviewed_at=pg_catalog.now()
    WHERE id=req.id;
  RETURN req.therapist_id;
END $fn$;
REVOKE ALL ON FUNCTION public.approve_therapist_profile_removal(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_therapist_profile_removal(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_lead(
  _challenge_id uuid,
  _answer integer,
  _ip_hash text,
  _session_hash text,
  _session_id text,
  _therapist_id uuid,
  _cta_id text,
  _source_problem_id uuid,
  _population_id uuid,
  _visitor_name text,
  _visitor_phone text,
  _message text,
  _user_agent text
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  lead_id uuid,
  cta_event_id uuid,
  billable boolean,
  therapist_name text,
  delivery_channel text,
  destination text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  ip_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(mins => 15);
  therapist_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(hours => 1);
  attempt_count integer;
  distinct_therapists integer;
  session_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  v_therapist public.therapists;
  v_cta_id uuid;
  v_billable boolean := false;
  v_lead_id uuid;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' OR _session_hash IS NULL OR _session_hash = '' THEN
    RAISE EXCEPTION 'identity hashes are required';
  END IF;

  -- Serialize per IP hash and per session hash so counting, challenge
  -- consumption and the inserts below cannot be interleaved by parallel
  -- requests sharing either identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  SELECT pg_catalog.count(*) INTO attempt_count
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash AND a.created_at >= ip_window;
  IF attempt_count >= 10 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO distinct_therapists
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.created_at >= ip_window
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF distinct_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO session_therapists
    FROM public.lead_submission_attempts a
    WHERE a.session_hash = _session_hash
      AND a.created_at >= ip_window
      AND a.outcome = 'accepted'
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF session_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO accepted_same
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.therapist_id = _therapist_id
      AND a.outcome = 'accepted'
      AND a.created_at >= therapist_window;
  IF accepted_same >= 3 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Challenge: single use, IP bound, expiring.
  SELECT * INTO challenge FROM public.lead_challenges c
    WHERE c.id = _challenge_id
    FOR UPDATE;

  IF NOT FOUND
     OR challenge.ip_hash IS DISTINCT FROM _ip_hash
     OR challenge.expected_answer IS DISTINCT FROM _answer THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_failed');
    RETURN QUERY SELECT false, 'challenge_failed', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= pg_catalog.now() THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_expired');
    RETURN QUERY SELECT false, 'challenge_expired', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Canonical public eligibility, re-checked at submission time. Lock the
  -- therapist row as well so the one-time unclaimed-profile contact gate is
  -- race-safe across concurrent visitors.
  SELECT * INTO v_therapist
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Profiles created by Tipulinks from public information may trigger only
  -- one initial contact across the whole platform until the therapist claims
  -- the profile. This is global per therapist, not per visitor/session.
  IF v_therapist.profile_origin = 'admin_public_info'
     AND v_therapist.owner_account_id IS NULL
     AND (v_therapist.first_contact_reserved_at IS NOT NULL OR v_therapist.first_contact_sent_at IS NOT NULL) THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'unclaimed_contact_limit');
    RETURN QUERY SELECT false, 'unclaimed_contact_limit', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- From here on everything commits or rolls back together.
  UPDATE public.lead_challenges
    SET consumed_at = pg_catalog.now()
    WHERE id = challenge.id;

  IF v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL THEN
    UPDATE public.therapists
      SET first_contact_reserved_at = pg_catalog.now()
      WHERE id = _therapist_id;
  END IF;

  INSERT INTO public.cta_clicks
      (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
    VALUES
      (_therapist_id, _session_id, coalesce(_cta_id, 'primary'), _source_problem_id,
       _ip_hash, _user_agent, NOT (v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL))
    ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
    RETURNING id INTO v_cta_id;

  IF v_cta_id IS NOT NULL THEN
    v_billable := NOT (v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL);
  ELSE
    SELECT c.id INTO v_cta_id
      FROM public.cta_clicks c
      WHERE c.session_id = _session_id
        AND c.therapist_id = _therapist_id
        AND c.cta_id = coalesce(_cta_id, 'primary')
      LIMIT 1;
  END IF;

  INSERT INTO public.lead_events (
    cta_event_id, session_id, therapist_id, problem_id, population_id,
    visitor_name, visitor_phone, message, challenge_presented, challenge_passed,
    delivery_channel, delivery_status
  ) VALUES (
    v_cta_id, _session_id, _therapist_id, _source_problem_id, _population_id,
    _visitor_name, _visitor_phone, _message, NULL, true,
    CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
         THEN 'email' ELSE coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp') END,
    CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
         THEN 'awaiting_consent' ELSE 'pending' END
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    VALUES (_ip_hash, _session_hash, _therapist_id, 'accepted');

  RETURN QUERY SELECT true,
                      CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
                           THEN 'accepted_unclaimed' ELSE 'accepted' END,
                      v_lead_id, v_cta_id, v_billable,
                      v_therapist.full_name,
                      CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
                           THEN 'email' ELSE coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp') END,
                      CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
                           THEN coalesce(nullif(v_therapist.email, ''), nullif(v_therapist.contact_destination, ''))
                           ELSE coalesce(nullif(v_therapist.contact_destination, ''), v_therapist.phone) END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) TO service_role;


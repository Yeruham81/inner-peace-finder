BEGIN;

-- Stage 3: connect the single held lead on an unclaimed admin-created profile
-- to a durable, auditable ownership invitation. Claim delivery state is kept
-- separate from lead delivery and from professional credential verification.

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS ownership_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ownership_verification_method text;

ALTER TABLE public.therapists
  DROP CONSTRAINT IF EXISTS therapists_ownership_verification_method_check,
  DROP CONSTRAINT IF EXISTS therapists_ownership_verification_pair_check;

ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_ownership_verification_method_check
    CHECK (
      ownership_verification_method IS NULL
      OR ownership_verification_method IN ('professional_email_invite', 'manual_review')
    ),
  ADD CONSTRAINT therapists_ownership_verification_pair_check
    CHECK ((ownership_verified_at IS NULL) = (ownership_verification_method IS NULL));

-- Existing rows are not force-hidden by this migration, but every future
-- insert/update must preserve the professional-email publishing invariant.
ALTER TABLE public.therapists
  DROP CONSTRAINT IF EXISTS therapists_admin_public_published_email_required;
ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_admin_public_published_email_required
  CHECK (
    profile_origin <> 'admin_public_info'
    OR profile_status <> 'published'
    OR nullif(pg_catalog.btrim(email), '') IS NOT NULL
  ) NOT VALID;

ALTER TABLE public.therapist_claim_invites
  ADD COLUMN IF NOT EXISTS source_lead_id uuid REFERENCES public.lead_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_delivery_error text,
  ADD COLUMN IF NOT EXISTS last_delivery_attempt_at timestamptz;

ALTER TABLE public.therapist_profile_requests
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.therapist_claim_invites
  DROP CONSTRAINT IF EXISTS therapist_claim_invites_source_check,
  DROP CONSTRAINT IF EXISTS therapist_claim_invites_delivery_status_check,
  DROP CONSTRAINT IF EXISTS therapist_claim_invites_delivery_attempts_check;

ALTER TABLE public.therapist_claim_invites
  ADD CONSTRAINT therapist_claim_invites_source_check
    CHECK (invite_source IN ('first_lead', 'profile_request', 'admin_resend', 'manual')),
  ADD CONSTRAINT therapist_claim_invites_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  ADD CONSTRAINT therapist_claim_invites_delivery_attempts_check
    CHECK (delivery_attempts >= 0);

UPDATE public.therapist_claim_invites
SET delivery_status = 'sent',
    delivery_attempts = greatest(delivery_attempts, 1),
    last_delivery_attempt_at = coalesce(last_delivery_attempt_at, sent_at)
WHERE sent_at IS NOT NULL AND delivery_status = 'pending';

CREATE INDEX IF NOT EXISTS therapist_claim_invites_source_lead_idx
  ON public.therapist_claim_invites(source_lead_id)
  WHERE source_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS therapist_claim_invites_delivery_queue_idx
  ON public.therapist_claim_invites(delivery_status, created_at DESC);


DROP FUNCTION IF EXISTS public.create_therapist_claim_invite(uuid,text,text,uuid,timestamptz);
CREATE FUNCTION public.create_therapist_claim_invite(
  _therapist_id uuid,
  _email text,
  _token_hash text,
  _created_by uuid,
  _expires_at timestamptz,
  _source_lead_id uuid DEFAULT NULL,
  _invite_source text DEFAULT 'manual',
  _replace_existing boolean DEFAULT false
)
RETURNS public.therapist_claim_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  t public.therapists;
  inv public.therapist_claim_invites;
BEGIN
  IF _invite_source NOT IN ('first_lead', 'profile_request', 'admin_resend', 'manual') THEN
    RAISE EXCEPTION 'invalid invite source';
  END IF;
  IF _expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invite expiry must be in the future';
  END IF;

  SELECT * INTO t
    FROM public.therapists
    WHERE id = _therapist_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'therapist not found'; END IF;
  IF t.owner_account_id IS NOT NULL
     OR t.profile_origin <> 'admin_public_info'
     OR t.do_not_republish THEN
    RAISE EXCEPTION 'profile is not claimable';
  END IF;
  IF t.email IS NULL
     OR lower(pg_catalog.btrim(t.email)) <> lower(pg_catalog.btrim(_email)) THEN
    RAISE EXCEPTION 'invite email must match the current profile email';
  END IF;

  IF _invite_source = 'first_lead' THEN
    IF _source_lead_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.lead_events AS lead
      WHERE lead.id = _source_lead_id
        AND lead.therapist_id = _therapist_id
        AND lead.delivery_status = 'awaiting_consent'
    ) THEN
      RAISE EXCEPTION 'first-lead invite requires the held lead';
    END IF;
  END IF;

  UPDATE public.therapist_claim_invites
    SET status = 'expired'
    WHERE therapist_id = _therapist_id
      AND status = 'pending'
      AND expires_at <= pg_catalog.now();

  IF EXISTS (
    SELECT 1
    FROM public.therapist_claim_invites
    WHERE therapist_id = _therapist_id AND status = 'pending'
  ) THEN
    IF NOT _replace_existing THEN
      RAISE EXCEPTION 'pending invite already exists';
    END IF;
    UPDATE public.therapist_claim_invites
      SET status = 'revoked', revoked_at = pg_catalog.now()
      WHERE therapist_id = _therapist_id AND status = 'pending';
  END IF;

  INSERT INTO public.therapist_claim_invites(
    therapist_id, email, token_hash, created_by, expires_at,
    source_lead_id, invite_source
  ) VALUES (
    _therapist_id, lower(pg_catalog.btrim(_email)), _token_hash, _created_by,
    _expires_at, _source_lead_id, _invite_source
  )
  RETURNING * INTO inv;

  RETURN inv;
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_therapist_claim_invite(uuid,text,text,uuid,timestamptz,uuid,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_therapist_claim_invite(uuid,text,text,uuid,timestamptz,uuid,text,boolean)
  TO service_role;


DROP FUNCTION IF EXISTS public.mark_therapist_claim_invite_sent(uuid);
CREATE FUNCTION public.mark_therapist_claim_invite_sent(
  _invite_id uuid,
  _provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  inv public.therapist_claim_invites;
  t public.therapists;
BEGIN
  SELECT * INTO inv
    FROM public.therapist_claim_invites
    WHERE id = _invite_id
    FOR UPDATE;
  IF NOT FOUND
     OR inv.status <> 'pending'
     OR inv.expires_at <= pg_catalog.now()
     OR inv.delivery_status <> 'pending' THEN
    RAISE EXCEPTION 'invite is not sendable';
  END IF;

  SELECT * INTO t
    FROM public.therapists
    WHERE id = inv.therapist_id
    FOR UPDATE;
  IF NOT FOUND
     OR t.owner_account_id IS NOT NULL
     OR t.profile_origin <> 'admin_public_info'
     OR t.do_not_republish
     OR lower(pg_catalog.btrim(coalesce(t.email, ''))) <> lower(pg_catalog.btrim(inv.email)) THEN
    RAISE EXCEPTION 'profile is not contactable';
  END IF;

  UPDATE public.therapist_claim_invites
    SET sent_at = coalesce(sent_at, pg_catalog.now()),
        delivery_status = 'sent',
        delivery_attempts = delivery_attempts + 1,
        provider_message_id = nullif(_provider_message_id, ''),
        last_delivery_error = NULL,
        last_delivery_attempt_at = pg_catalog.now()
    WHERE id = inv.id;

  UPDATE public.therapists
    SET first_contact_sent_at = coalesce(first_contact_sent_at, pg_catalog.now())
    WHERE id = inv.therapist_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.mark_therapist_claim_invite_sent(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_therapist_claim_invite_sent(uuid,text)
  TO service_role;


CREATE OR REPLACE FUNCTION public.mark_therapist_claim_invite_failed(
  _invite_id uuid,
  _error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.therapist_claim_invites
    SET status = 'revoked',
        revoked_at = pg_catalog.now(),
        delivery_status = 'failed',
        delivery_attempts = delivery_attempts + 1,
        last_delivery_error = pg_catalog.left(coalesce(_error, 'delivery_failed'), 1000),
        last_delivery_attempt_at = pg_catalog.now()
    WHERE id = _invite_id
      AND status = 'pending'
      AND sent_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'invite is not fail-markable'; END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.mark_therapist_claim_invite_failed(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_therapist_claim_invite_failed(uuid,text)
  TO service_role;


DROP FUNCTION IF EXISTS public.claim_therapist_by_invite(text,uuid,text);
CREATE FUNCTION public.claim_therapist_by_invite(
  _token_hash text,
  _auth_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  inv public.therapist_claim_invites;
  acc public.therapist_accounts;
  t public.therapists;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
BEGIN
  SELECT lower(pg_catalog.btrim(u.email)), u.email_confirmed_at
    INTO v_auth_email, v_email_confirmed_at
    FROM auth.users AS u
    WHERE u.id = _auth_user_id;
  IF v_auth_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'account email is not verified';
  END IF;

  SELECT * INTO inv
    FROM public.therapist_claim_invites
    WHERE token_hash = _token_hash
    FOR UPDATE;
  IF NOT FOUND
     OR inv.status <> 'pending'
     OR inv.delivery_status <> 'sent'
     OR inv.sent_at IS NULL
     OR inv.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'invite invalid or expired';
  END IF;
  IF lower(pg_catalog.btrim(inv.email)) <> v_auth_email THEN
    RAISE EXCEPTION 'signed-in email does not match invite';
  END IF;

  SELECT * INTO acc
    FROM public.therapist_accounts
    WHERE auth_user_id = _auth_user_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'therapist account not found'; END IF;

  SELECT * INTO t
    FROM public.therapists
    WHERE id = inv.therapist_id
    FOR UPDATE;
  IF NOT FOUND
     OR t.owner_account_id IS NOT NULL
     OR t.profile_origin <> 'admin_public_info'
     OR t.do_not_republish THEN
    RAISE EXCEPTION 'profile is not claimable';
  END IF;
  IF lower(pg_catalog.btrim(coalesce(t.email, ''))) <> lower(pg_catalog.btrim(inv.email)) THEN
    RAISE EXCEPTION 'profile email changed after invitation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.therapists AS owned
    WHERE owned.owner_account_id = acc.id AND owned.id <> t.id
  ) THEN
    RAISE EXCEPTION 'account already owns another profile';
  END IF;

  UPDATE public.therapists
    SET owner_account_id = acc.id,
        profile_claimed = true,
        ownership_verified_at = pg_catalog.now(),
        ownership_verification_method = 'professional_email_invite',
        owner_reviewed_at = NULL,
        participation_consent_at = pg_catalog.now(),
        participation_consent_source = 'claim_invite'
    WHERE id = t.id;

  UPDATE public.therapist_accounts
    SET account_status = 'claimed', onboarding_completed = false
    WHERE id = acc.id;

  UPDATE public.therapist_claim_invites
    SET status = 'accepted',
        accepted_by_account_id = acc.id,
        accepted_at = pg_catalog.now()
    WHERE id = inv.id;

  UPDATE public.therapist_claim_invites
    SET status = 'revoked', revoked_at = pg_catalog.now()
    WHERE therapist_id = t.id AND status = 'pending' AND id <> inv.id;

  UPDATE public.therapist_profile_requests
    SET status = 'approved',
        verification_method = 'existing_email',
        reviewed_at = pg_catalog.now()
    WHERE therapist_id = t.id
      AND request_type = 'claim_profile'
      AND status = 'pending';

  RETURN t.id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.claim_therapist_by_invite(text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_therapist_by_invite(text,uuid)
  TO service_role;


CREATE OR REPLACE FUNCTION public.approve_therapist_profile_removal(
  _request_id uuid,
  _reviewer uuid,
  _verification_method text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  req public.therapist_profile_requests;
  t public.therapists;
  v_is_admin boolean := false;
BEGIN
  IF _verification_method NOT IN ('existing_email', 'existing_phone', 'manual_review') THEN
    RAISE EXCEPTION 'invalid verification method';
  END IF;
  SELECT coalesce((u.raw_app_meta_data ->> 'tipulinks_role') = 'admin', false)
    INTO v_is_admin
    FROM auth.users AS u
    WHERE u.id = _reviewer;
  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO req
    FROM public.therapist_profile_requests
    WHERE id = _request_id
    FOR UPDATE;
  IF NOT FOUND OR req.request_type <> 'remove_profile' OR req.status <> 'pending' THEN
    RAISE EXCEPTION 'removal request is not pending';
  END IF;

  SELECT * INTO t
    FROM public.therapists
    WHERE id = req.therapist_id
    FOR UPDATE;
  IF NOT FOUND
     OR t.profile_origin <> 'admin_public_info'
     OR t.owner_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'profile is not removable through the public opt-out flow';
  END IF;

  UPDATE public.therapists
    SET visibility = 'hidden_by_owner',
        is_active = false,
        do_not_republish = true
    WHERE id = req.therapist_id;

  UPDATE public.therapist_claim_invites
    SET status = 'revoked', revoked_at = pg_catalog.now()
    WHERE therapist_id = req.therapist_id AND status = 'pending';

  UPDATE public.lead_events
    SET delivery_status = 'cancelled_after_opt_out'
    WHERE therapist_id = req.therapist_id
      AND delivery_status = 'awaiting_consent';

  UPDATE public.therapist_profile_requests
    SET status = 'approved',
        verification_method = _verification_method,
        reviewed_by = _reviewer,
        reviewed_at = pg_catalog.now()
    WHERE id = req.id;

  UPDATE public.therapist_profile_requests
    SET status = 'rejected',
        review_note = 'הפרופיל הוסר לבקשת המטפל/ת.',
        reviewed_by = _reviewer,
        reviewed_at = pg_catalog.now()
    WHERE therapist_id = req.therapist_id
      AND id <> req.id
      AND status = 'pending';

  RETURN req.therapist_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.approve_therapist_profile_removal(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_therapist_profile_removal(uuid,uuid,text)
  TO service_role;


-- The pre-v2 authenticated claim-request path is retired. Historical rows are
-- retained for audit, but it can no longer create or approve ownership.
DROP TRIGGER IF EXISTS trg_claim_notify_insert ON public.therapist_claim_requests;
DROP TRIGGER IF EXISTS trg_claim_notify_update ON public.therapist_claim_requests;
REVOKE ALL ON TABLE public.therapist_claim_requests FROM authenticated;
DROP FUNCTION IF EXISTS public.approve_therapist_claim(uuid,uuid);
DROP FUNCTION IF EXISTS public.set_claim_request_status(uuid,uuid,public.claim_request_status);

COMMIT;

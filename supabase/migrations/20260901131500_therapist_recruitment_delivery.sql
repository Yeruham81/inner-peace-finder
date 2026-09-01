-- Therapist recruitment invitation delivery (Phase 2).
-- Adds atomic daily quota reservation, Brevo campaign correlation, provider
-- event application, and invitation-authorized therapist account creation.

BEGIN;

CREATE TABLE IF NOT EXISTS public.therapist_recruitment_send_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  channel text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'preparing',
  created_by uuid NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  provider_list_id bigint,
  provider_campaign_id bigint,
  provider_list_deleted_at timestamptz,
  submitted_at timestamptz,
  failure_code text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT therapist_recruitment_send_batches_channel_check
    CHECK (channel IN ('email', 'sms', 'whatsapp')),
  CONSTRAINT therapist_recruitment_send_batches_provider_check
    CHECK (provider IN ('brevo')),
  CONSTRAINT therapist_recruitment_send_batches_status_check
    CHECK (status IN ('preparing', 'submitting', 'submitted', 'submission_failed', 'submission_unknown')),
  CONSTRAINT therapist_recruitment_send_batches_recipient_count_check
    CHECK (recipient_count >= 0 AND recipient_count <= 100)
);

ALTER TABLE public.therapist_recruitment_send_batches
  ADD COLUMN IF NOT EXISTS provider_list_deleted_at timestamptz;

ALTER TABLE public.therapist_recruitment_invitations
  ADD COLUMN IF NOT EXISTS send_batch_id uuid REFERENCES public.therapist_recruitment_send_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS provider_campaign_id bigint,
  ADD COLUMN IF NOT EXISTS provider_list_id bigint,
  ADD COLUMN IF NOT EXISTS send_quota_date date;

CREATE UNIQUE INDEX IF NOT EXISTS therapist_recruitment_invite_token_hash_key
  ON public.therapist_recruitment_invitations(invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS therapist_recruitment_campaign_destination_idx
  ON public.therapist_recruitment_invitations(provider_campaign_id, destination_normalized)
  WHERE provider_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS therapist_recruitment_quota_date_idx
  ON public.therapist_recruitment_invitations(send_quota_date, channel, status)
  WHERE send_quota_date IS NOT NULL;

DROP TRIGGER IF EXISTS trg_therapist_recruitment_send_batches_updated_at
  ON public.therapist_recruitment_send_batches;
CREATE TRIGGER trg_therapist_recruitment_send_batches_updated_at
  BEFORE UPDATE ON public.therapist_recruitment_send_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.therapist_recruitment_send_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_send_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.therapist_recruitment_send_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.therapist_recruitment_send_batches TO service_role;

COMMENT ON TABLE public.therapist_recruitment_send_batches IS
  'One provider submission attempt for a selected set of therapist recruitment invitations.';
COMMENT ON COLUMN public.therapist_recruitment_invitations.invite_token_hash IS
  'SHA-256 of the secret recruitment token. The raw token is never stored in Tipulinks.';
COMMENT ON COLUMN public.therapist_recruitment_invitations.send_quota_date IS
  'Asia/Jerusalem calendar date whose daily recruitment-email quota slot was reserved.';

-- UI helper. This is advisory only; the reserve function below is the atomic
-- enforcement boundary and uses an advisory transaction lock.
CREATE OR REPLACE FUNCTION public.get_recruitment_email_daily_capacity()
RETURNS TABLE (
  send_date date,
  used_count integer,
  remaining_count integer,
  daily_limit integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH clock AS (
    SELECT (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Jerusalem')::date AS today
  ), usage AS (
    SELECT pg_catalog.count(*)::integer AS used
    FROM public.therapist_recruitment_invitations AS invitation, clock
    WHERE invitation.channel = 'email'
      AND invitation.send_quota_date = clock.today
      AND invitation.status IN (
        'submitting', 'submitted', 'delivered', 'bounced', 'declined', 'registered', 'submission_unknown'
      )
  )
  SELECT clock.today, usage.used, greatest(0, 100 - usage.used), 100
  FROM clock, usage;
$fn$;

REVOKE ALL ON FUNCTION public.get_recruitment_email_daily_capacity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recruitment_email_daily_capacity() TO service_role;

-- Reserve an exact selected set atomically. _reservations is a JSON array of:
-- [{"id":"<uuid>","token_hash":"<64 lowercase hex>"}, ...]
CREATE OR REPLACE FUNCTION public.reserve_recruitment_email_invitations(
  _reservations jsonb,
  _created_by uuid
)
RETURNS TABLE (
  send_batch_id uuid,
  invitation_id uuid,
  destination_normalized text,
  first_name text,
  last_name text,
  remaining_after_reservation integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_requested_count integer;
  v_distinct_ids integer;
  v_distinct_hashes integer;
  v_eligible_count integer;
  v_used integer;
  v_today date;
  v_batch_id uuid;
BEGIN
  IF _created_by IS NULL THEN
    RAISE EXCEPTION 'missing_admin_user';
  END IF;
  IF _reservations IS NULL OR pg_catalog.jsonb_typeof(_reservations) <> 'array' THEN
    RAISE EXCEPTION 'invalid_recruitment_reservations';
  END IF;

  CREATE TEMP TABLE pg_temp._recruitment_requested (
    invitation_id uuid PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    ordinal bigint NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp._recruitment_requested (invitation_id, token_hash, ordinal)
  SELECT
    (item.value ->> 'id')::uuid,
    pg_catalog.lower(pg_catalog.btrim(item.value ->> 'token_hash')),
    item.ordinality
  FROM pg_catalog.jsonb_array_elements(_reservations) WITH ORDINALITY AS item(value, ordinality);

  SELECT pg_catalog.count(*), pg_catalog.count(DISTINCT invitation_id), pg_catalog.count(DISTINCT token_hash)
    INTO v_requested_count, v_distinct_ids, v_distinct_hashes
  FROM pg_temp._recruitment_requested;

  IF v_requested_count < 1 OR v_requested_count > 100
     OR v_distinct_ids <> v_requested_count
     OR v_distinct_hashes <> v_requested_count
     OR EXISTS (
       SELECT 1 FROM pg_temp._recruitment_requested
       WHERE token_hash !~ '^[0-9a-f]{64}$'
     ) THEN
    RAISE EXCEPTION 'invalid_recruitment_reservations';
  END IF;

  -- Serialize quota reservations so two admins cannot jointly exceed 100/day.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tipulinks_recruitment_email_daily_quota'));
  v_today := (pg_catalog.clock_timestamp() AT TIME ZONE 'Asia/Jerusalem')::date;

  SELECT pg_catalog.count(*)::integer
    INTO v_used
  FROM public.therapist_recruitment_invitations
  WHERE channel = 'email'
    AND send_quota_date = v_today
    AND status IN (
      'submitting', 'submitted', 'delivered', 'bounced', 'declined', 'registered', 'submission_unknown'
    );

  IF v_used + v_requested_count > 100 THEN
    RAISE EXCEPTION 'recruitment_daily_limit_exceeded';
  END IF;

  -- Lock all selected rows and re-check eligibility at the server/database
  -- boundary. A stale browser selection cannot bypass these rules.
  PERFORM invitation.id
  FROM public.therapist_recruitment_invitations AS invitation
  JOIN pg_temp._recruitment_requested AS requested ON requested.invitation_id = invitation.id
  ORDER BY requested.ordinal
  FOR UPDATE;

  SELECT pg_catalog.count(*)::integer
    INTO v_eligible_count
  FROM public.therapist_recruitment_invitations AS invitation
  JOIN pg_temp._recruitment_requested AS requested ON requested.invitation_id = invitation.id
  WHERE invitation.channel = 'email'
    AND invitation.status IN ('ready', 'submission_failed')
    AND invitation.submitted_at IS NULL
    AND invitation.bounced_at IS NULL
    AND invitation.declined_at IS NULL
    AND invitation.registered_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.therapist_recruitment_suppressions AS suppression
      WHERE suppression.channel = 'email'
        AND suppression.destination_normalized = invitation.destination_normalized
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contact_email_suppressions AS suppression
      WHERE suppression.email_normalized = invitation.destination_normalized
    )
    AND NOT EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      JOIN public.therapist_accounts AS account ON account.auth_user_id = auth_user.id
      WHERE pg_catalog.lower(pg_catalog.btrim(auth_user.email)) = invitation.destination_normalized
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.therapists AS therapist
      WHERE therapist.email IS NOT NULL
        AND pg_catalog.lower(pg_catalog.btrim(therapist.email)) = invitation.destination_normalized
    );

  IF v_eligible_count <> v_requested_count THEN
    RAISE EXCEPTION 'recruitment_selection_no_longer_eligible';
  END IF;

  INSERT INTO public.therapist_recruitment_send_batches (
    channel, provider, status, created_by, recipient_count
  ) VALUES (
    'email', 'brevo', 'preparing', _created_by, v_requested_count
  ) RETURNING id INTO v_batch_id;

  UPDATE public.therapist_recruitment_invitations AS invitation
  SET
    status = 'submitting',
    provider = 'brevo',
    send_batch_id = v_batch_id,
    invite_token_hash = requested.token_hash,
    submission_started_at = pg_catalog.clock_timestamp(),
    send_quota_date = v_today,
    provider_message_id = NULL,
    provider_campaign_id = NULL,
    provider_list_id = NULL,
    failure_code = NULL,
    failure_reason = NULL
  FROM pg_temp._recruitment_requested AS requested
  WHERE invitation.id = requested.invitation_id;

  UPDATE public.therapist_recruitment_send_batches
  SET status = 'submitting'
  WHERE id = v_batch_id;

  RETURN QUERY
  SELECT
    v_batch_id,
    invitation.id,
    invitation.destination_normalized,
    invitation.first_name,
    invitation.last_name,
    greatest(0, 100 - (v_used + v_requested_count))
  FROM public.therapist_recruitment_invitations AS invitation
  JOIN pg_temp._recruitment_requested AS requested ON requested.invitation_id = invitation.id
  ORDER BY requested.ordinal;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reserve_recruitment_email_invitations(jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_recruitment_email_invitations(jsonb, uuid)
  TO service_role;

-- Persist a newly-created Brevo list immediately. This prevents a process
-- crash during contact/campaign preparation from leaving an untracked list.
CREATE OR REPLACE FUNCTION public.attach_recruitment_email_provider_list(
  _send_batch_id uuid,
  _provider_list_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF _provider_list_id IS NULL THEN
    RAISE EXCEPTION 'missing_recruitment_provider_list_id';
  END IF;

  UPDATE public.therapist_recruitment_send_batches
  SET provider_list_id = _provider_list_id,
      provider_list_deleted_at = NULL
  WHERE id = _send_batch_id
    AND provider = 'brevo'
    AND status = 'submitting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recruitment_send_batch_not_submitting';
  END IF;

  UPDATE public.therapist_recruitment_invitations
  SET provider_list_id = _provider_list_id
  WHERE send_batch_id = _send_batch_id
    AND provider = 'brevo'
    AND status = 'submitting';
END;
$fn$;

REVOKE ALL ON FUNCTION public.attach_recruitment_email_provider_list(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_recruitment_email_provider_list(uuid, bigint)
  TO service_role;

-- Persist the campaign id BEFORE sendNow. Marketing webhooks may arrive
-- extremely quickly, and they correlate by campaign id + destination email.
CREATE OR REPLACE FUNCTION public.attach_recruitment_email_provider_batch(
  _send_batch_id uuid,
  _provider_list_id bigint,
  _provider_campaign_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF _provider_list_id IS NULL OR _provider_campaign_id IS NULL THEN
    RAISE EXCEPTION 'missing_recruitment_provider_ids';
  END IF;

  UPDATE public.therapist_recruitment_send_batches
  SET provider_list_id = _provider_list_id,
      provider_campaign_id = _provider_campaign_id
  WHERE id = _send_batch_id
    AND provider = 'brevo'
    AND status = 'submitting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recruitment_send_batch_not_submitting';
  END IF;

  UPDATE public.therapist_recruitment_invitations
  SET provider_list_id = _provider_list_id,
      provider_campaign_id = _provider_campaign_id
  WHERE send_batch_id = _send_batch_id
    AND provider = 'brevo'
    AND status IN ('submitting', 'delivered', 'bounced', 'declined', 'registered');
END;
$fn$;

REVOKE ALL ON FUNCTION public.attach_recruitment_email_provider_batch(uuid, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_recruitment_email_provider_batch(uuid, bigint, bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_recruitment_provider_list_deleted(
  _send_batch_id uuid,
  _provider_list_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.therapist_recruitment_send_batches
  SET provider_list_deleted_at = coalesce(provider_list_deleted_at, pg_catalog.clock_timestamp())
  WHERE id = _send_batch_id
    AND provider = 'brevo'
    AND provider_list_id = _provider_list_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_recruitment_provider_list_deleted(uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_recruitment_provider_list_deleted(uuid, bigint)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_recruitment_email_send_batch(
  _send_batch_id uuid,
  _outcome text,
  _failure_code text DEFAULT NULL,
  _failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF _outcome NOT IN ('submitted', 'submission_failed', 'submission_unknown') THEN
    RAISE EXCEPTION 'invalid_recruitment_send_outcome';
  END IF;

  IF _outcome = 'submitted' THEN
    UPDATE public.therapist_recruitment_send_batches
    SET status = 'submitted', submitted_at = coalesce(submitted_at, v_now), failure_code = NULL, failure_reason = NULL
    WHERE id = _send_batch_id AND status = 'submitting';

    UPDATE public.therapist_recruitment_invitations
    SET submitted_at = coalesce(submitted_at, v_now),
        status = CASE WHEN status = 'submitting' THEN 'submitted' ELSE status END,
        failure_code = NULL,
        failure_reason = NULL
    WHERE send_batch_id = _send_batch_id
      AND status IN ('submitting', 'delivered', 'bounced', 'declined', 'registered');

  ELSIF _outcome = 'submission_failed' THEN
    UPDATE public.therapist_recruitment_send_batches
    SET status = 'submission_failed', failure_code = _failure_code, failure_reason = _failure_reason
    WHERE id = _send_batch_id AND status = 'submitting';

    UPDATE public.therapist_recruitment_invitations
    SET status = 'submission_failed',
        send_quota_date = NULL,
        failure_code = _failure_code,
        failure_reason = _failure_reason
    WHERE send_batch_id = _send_batch_id
      AND status = 'submitting'
      AND submitted_at IS NULL;

  ELSE
    UPDATE public.therapist_recruitment_send_batches
    SET status = 'submission_unknown', failure_code = _failure_code, failure_reason = _failure_reason
    WHERE id = _send_batch_id AND status = 'submitting';

    UPDATE public.therapist_recruitment_invitations
    SET status = CASE WHEN status = 'submitting' THEN 'submission_unknown' ELSE status END,
        failure_code = _failure_code,
        failure_reason = _failure_reason
    WHERE send_batch_id = _send_batch_id
      AND status IN ('submitting', 'delivered', 'bounced', 'declined', 'registered');
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finish_recruitment_email_send_batch(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_recruitment_email_send_batch(uuid, text, text, text)
  TO service_role;

-- Apply out-of-order Brevo marketing events safely. Unsubscribe/spam also create
-- a durable channel-scoped recruitment suppression. This does NOT touch the
-- global transactional-email suppression registry.
CREATE OR REPLACE FUNCTION public.apply_recruitment_email_event(
  _provider_campaign_id bigint,
  _email text,
  _event text,
  _event_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid;
  v_status text;
  v_email text := pg_catalog.lower(pg_catalog.btrim(_email));
  v_event text := pg_catalog.lower(pg_catalog.btrim(_event));
  v_at timestamptz := coalesce(_event_at, pg_catalog.clock_timestamp());
BEGIN
  SELECT invitation.id, invitation.status
    INTO v_id, v_status
  FROM public.therapist_recruitment_invitations AS invitation
  WHERE invitation.channel = 'email'
    AND invitation.provider = 'brevo'
    AND invitation.provider_campaign_id = _provider_campaign_id
    AND invitation.destination_normalized = v_email
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_event = 'delivered' THEN
    UPDATE public.therapist_recruitment_invitations
    SET submitted_at = coalesce(submitted_at, v_at),
        delivered_at = coalesce(delivered_at, v_at),
        status = CASE WHEN status IN ('submitting', 'submitted', 'submission_failed', 'submission_unknown') THEN 'delivered' ELSE status END
    WHERE id = v_id;

  ELSIF v_event IN ('hard_bounce', 'soft_bounce', 'bounce', 'invalid_email', 'blocked') THEN
    UPDATE public.therapist_recruitment_invitations
    SET submitted_at = coalesce(submitted_at, v_at),
        bounced_at = coalesce(bounced_at, v_at),
        status = CASE WHEN status IN ('submitting', 'submitted', 'delivered', 'submission_failed', 'submission_unknown') THEN 'bounced' ELSE status END,
        failure_code = v_event
    WHERE id = v_id;

  ELSIF v_event IN ('unsubscribed', 'unsubscribe', 'spam') THEN
    INSERT INTO public.therapist_recruitment_suppressions (
      channel, destination_normalized, source, reason
    ) VALUES (
      'email', v_email,
      CASE WHEN v_event = 'spam' THEN 'provider' ELSE 'recipient_opt_out' END,
      v_event
    )
    ON CONFLICT (channel, destination_normalized)
    DO UPDATE SET
      source = EXCLUDED.source,
      reason = EXCLUDED.reason,
      updated_at = pg_catalog.clock_timestamp();

    UPDATE public.therapist_recruitment_invitations
    SET submitted_at = coalesce(submitted_at, v_at),
        declined_at = coalesce(declined_at, v_at),
        decline_source = CASE WHEN v_event = 'spam' THEN 'provider_spam' ELSE 'email_unsubscribe' END,
        status = CASE WHEN status = 'registered' THEN 'registered' ELSE 'declined' END
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_recruitment_email_event(bigint, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_recruitment_email_event(bigint, text, text, timestamptz)
  TO service_role;

-- A recruitment invitation can authorize creation of one therapist account even
-- while the global registration switch is off. The caller must be authenticated,
-- have a verified email, and that email must exactly match the invitation target.
CREATE OR REPLACE FUNCTION public.claim_recruitment_invite(_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  account_id uuid,
  created_account boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.therapist_recruitment_invitations%ROWTYPE;
  v_account_id uuid;
  v_created boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'recruitment_invite_auth_required';
  END IF;
  IF _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_recruitment_invite';
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(auth_user.email)), auth_user.email_confirmed_at
    INTO v_email, v_email_confirmed_at
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_user_id;

  IF v_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'recruitment_invite_verified_email_required';
  END IF;

  SELECT * INTO v_invitation
  FROM public.therapist_recruitment_invitations AS invitation
  WHERE invitation.invite_token_hash = _token_hash
  FOR UPDATE;

  IF v_invitation.id IS NULL OR v_invitation.channel <> 'email' THEN
    RAISE EXCEPTION 'invalid_recruitment_invite';
  END IF;

  IF v_invitation.destination_normalized <> v_email THEN
    RAISE EXCEPTION 'recruitment_invite_email_mismatch';
  END IF;

  SELECT account.id INTO v_account_id
  FROM public.therapist_accounts AS account
  WHERE account.auth_user_id = v_user_id;

  IF v_invitation.status = 'registered' THEN
    IF v_invitation.registered_account_id IS NOT NULL
       AND v_account_id = v_invitation.registered_account_id THEN
      RETURN QUERY SELECT v_invitation.id, v_account_id, false;
      RETURN;
    END IF;
    RAISE EXCEPTION 'recruitment_invite_already_used';
  END IF;

  IF v_invitation.status NOT IN ('submitted', 'delivered')
     OR v_invitation.submitted_at IS NULL
     OR v_invitation.bounced_at IS NOT NULL
     OR v_invitation.declined_at IS NOT NULL THEN
    RAISE EXCEPTION 'recruitment_invite_not_available';
  END IF;

  IF v_account_id IS NULL THEN
    INSERT INTO public.therapist_accounts (auth_user_id)
    VALUES (v_user_id)
    RETURNING id INTO v_account_id;
    v_created := true;
  END IF;

  UPDATE public.therapist_recruitment_invitations
  SET status = 'registered',
      registered_at = coalesce(registered_at, pg_catalog.clock_timestamp()),
      registered_account_id = v_account_id,
      failure_code = NULL,
      failure_reason = NULL
  WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_invitation.id, v_account_id, v_created;
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_recruitment_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_recruitment_invite(text) TO authenticated, service_role;

COMMIT;

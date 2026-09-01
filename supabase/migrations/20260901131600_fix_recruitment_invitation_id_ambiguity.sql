-- Fix PL/pgSQL ambiguity between the RETURNS TABLE output parameter
-- `invitation_id` and pg_temp._recruitment_requested.invitation_id.
-- Safe to apply after 20260901131500_therapist_recruitment_delivery.sql.

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

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(DISTINCT requested.invitation_id),
    pg_catalog.count(DISTINCT requested.token_hash)
    INTO v_requested_count, v_distinct_ids, v_distinct_hashes
  FROM pg_temp._recruitment_requested AS requested;

  IF v_requested_count < 1 OR v_requested_count > 100
     OR v_distinct_ids <> v_requested_count
     OR v_distinct_hashes <> v_requested_count
     OR EXISTS (
       SELECT 1
       FROM pg_temp._recruitment_requested AS requested
       WHERE requested.token_hash !~ '^[0-9a-f]{64}$'
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

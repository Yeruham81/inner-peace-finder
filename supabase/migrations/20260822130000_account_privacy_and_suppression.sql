-- Account deletion, protected no-contact registry, and suppression enforcement.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_email_suppressions (
  email_normalized text PRIMARY KEY,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT contact_email_suppressions_email_check CHECK (
    email_normalized = pg_catalog.lower(pg_catalog.btrim(email_normalized))
    AND pg_catalog.length(email_normalized) BETWEEN 3 AND 320
    AND pg_catalog.strpos(email_normalized, '@') > 1
  ),
  CONSTRAINT contact_email_suppressions_source_check CHECK (
    source IN ('account_self_deletion', 'profile_opt_out', 'admin_recorded')
  )
);

ALTER TABLE public.contact_email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contact_email_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.contact_email_suppressions TO service_role;

COMMENT ON TABLE public.contact_email_suppressions IS
  'Minimal protected no-contact registry. Stores no name, phone, account id or profile content.';

CREATE OR REPLACE FUNCTION public.record_contact_email_suppressions(
  _emails text[],
  _source text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_count integer := 0;
BEGIN
  IF _source NOT IN ('account_self_deletion', 'profile_opt_out', 'admin_recorded') THEN
    RAISE EXCEPTION 'invalid suppression source';
  END IF;

  WITH normalized AS (
    SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(value)) AS email_normalized
    FROM pg_catalog.unnest(coalesce(_emails, ARRAY[]::text[])) AS email_row(value)
    WHERE value IS NOT NULL
      AND pg_catalog.length(pg_catalog.btrim(value)) BETWEEN 3 AND 320
      AND pg_catalog.strpos(pg_catalog.btrim(value), '@') > 1
  ), upserted AS (
    INSERT INTO public.contact_email_suppressions (email_normalized, source)
    SELECT email_normalized, _source
    FROM normalized
    ON CONFLICT (email_normalized) DO UPDATE
      SET last_confirmed_at = pg_catalog.now(),
          source = CASE
            WHEN EXCLUDED.source = 'account_self_deletion' THEN EXCLUDED.source
            ELSE public.contact_email_suppressions.source
          END
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::integer INTO v_count FROM upserted;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_contact_email_suppressions(text[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_contact_email_suppressions(text[], text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.is_contact_email_suppressed(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN _email IS NULL OR pg_catalog.btrim(_email) = '' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.contact_email_suppressions AS suppression
      WHERE suppression.email_normalized = pg_catalog.lower(pg_catalog.btrim(_email))
    )
  END;
$fn$;

REVOKE ALL ON FUNCTION public.is_contact_email_suppressed(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_contact_email_suppressed(text)
  TO service_role;

-- Preserve previously approved opt-outs in the centralized registry.
SELECT public.record_contact_email_suppressions(
  ARRAY(
    SELECT email
    FROM public.therapists
    WHERE do_not_republish = true AND email IS NOT NULL
  ),
  'profile_opt_out'
);

SELECT public.record_contact_email_suppressions(
  ARRAY(
    SELECT requester_email
    FROM public.therapist_profile_requests
    WHERE request_type = 'remove_profile'
      AND status = 'approved'
      AND requester_email IS NOT NULL
  ),
  'profile_opt_out'
);

CREATE OR REPLACE FUNCTION public.enforce_admin_profile_email_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.profile_origin = 'admin_public_info'
     AND public.is_contact_email_suppressed(NEW.email) THEN
    RAISE EXCEPTION 'contact_email_suppressed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_admin_profile_email_suppression()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_admin_profile_email_suppression ON public.therapists;
CREATE TRIGGER trg_enforce_admin_profile_email_suppression
  BEFORE INSERT OR UPDATE OF email, profile_origin ON public.therapists
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_profile_email_suppression();

CREATE OR REPLACE FUNCTION public.enforce_claim_invite_email_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF public.is_contact_email_suppressed(NEW.email) THEN
    RAISE EXCEPTION 'contact_email_suppressed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_claim_invite_email_suppression()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_claim_invite_email_suppression ON public.therapist_claim_invites;
CREATE TRIGGER trg_enforce_claim_invite_email_suppression
  BEFORE INSERT OR UPDATE OF email ON public.therapist_claim_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_claim_invite_email_suppression();

UPDATE public.therapist_claim_invites AS invite
SET status = 'revoked',
    revoked_at = coalesce(invite.revoked_at, pg_catalog.now())
WHERE invite.status = 'pending'
  AND public.is_contact_email_suppressed(invite.email);

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

  PERFORM public.record_contact_email_suppressions(
    ARRAY[t.email, req.requester_email],
    'profile_opt_out'
  );

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

REVOKE ALL ON FUNCTION public.approve_therapist_profile_removal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_therapist_profile_removal(uuid, uuid, text)
  TO service_role;

COMMIT;

BEGIN;

-- Read-only normalized feed for the admin ownership/removal management screen.
-- Access remains service-role only; browser clients never query these private
-- request/invite tables directly.
DROP VIEW IF EXISTS public.admin_profile_claims;

CREATE VIEW public.admin_profile_claims
WITH (security_invoker = true)
AS
SELECT
  'invite'::text AS kind,
  invite.id,
  invite.therapist_id,
  therapist.full_name AS therapist_name,
  therapist.professional_title,
  therapist.email AS profile_email,
  therapist.slug AS therapist_slug,
  therapist.owner_account_id,
  therapist.profile_claimed,
  therapist.profile_status,
  therapist.visibility,
  therapist.is_active,
  therapist.do_not_republish,
  therapist.ownership_verification_method AS profile_ownership_verification_method,
  therapist.ownership_verified_at AS profile_ownership_verified_at,
  NULL::text AS requester_name,
  NULL::text AS requester_email,
  NULL::text AS requester_phone,
  NULL::text AS request_note,
  NULL::text AS review_note,
  NULL::uuid AS reviewed_by,
  CASE
    WHEN invite.status = 'accepted' THEN 'invite_accepted'
    WHEN invite.status = 'revoked' THEN 'invite_revoked'
    WHEN invite.status = 'expired'
      OR (invite.status = 'pending' AND invite.expires_at <= pg_catalog.now()) THEN 'invite_expired'
    WHEN invite.delivery_status = 'failed' THEN 'invite_failed'
    WHEN invite.delivery_status = 'sent' THEN 'invite_sent'
    ELSE 'invite_pending'
  END::text AS status,
  CASE
    WHEN invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
      AND invite.delivery_status = 'failed' THEN 1
    WHEN invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
      AND invite.delivery_status = 'pending' THEN 2
    WHEN invite.status = 'pending'
      AND invite.expires_at > pg_catalog.now()
      AND invite.delivery_status = 'sent' THEN 3
    ELSE 4
  END::integer AS attention_rank,
  invite.created_at,
  invite.sent_at,
  invite.accepted_at,
  invite.expires_at,
  invite.revoked_at,
  CASE
    WHEN invite.status = 'accepted' THEN invite.accepted_at
    WHEN invite.status = 'expired' THEN invite.expires_at
    WHEN invite.status = 'pending' AND invite.expires_at <= pg_catalog.now() THEN invite.expires_at
    WHEN invite.status = 'revoked' THEN invite.revoked_at
    ELSE NULL
  END AS resolved_at,
  invite.source_lead_id,
  invite.provider_message_id,
  invite.last_delivery_error,
  CASE WHEN invite.status = 'accepted' THEN 'professional_email_invite' ELSE NULL END::text AS verification_method,
  'email'::text AS verification_category,
  pg_catalog.concat_ws(
    ' ',
    therapist.full_name,
    therapist.professional_title,
    therapist.email,
    invite.email,
    therapist.id::text,
    invite.id::text
  ) AS search_text
FROM public.therapist_claim_invites AS invite
JOIN public.therapists AS therapist ON therapist.id = invite.therapist_id

UNION ALL

SELECT
  CASE
    WHEN request.request_type = 'remove_profile' THEN 'removal_request'
    ELSE 'claim_request'
  END::text AS kind,
  request.id,
  request.therapist_id,
  therapist.full_name AS therapist_name,
  therapist.professional_title,
  therapist.email AS profile_email,
  therapist.slug AS therapist_slug,
  therapist.owner_account_id,
  therapist.profile_claimed,
  therapist.profile_status,
  therapist.visibility,
  therapist.is_active,
  therapist.do_not_republish,
  therapist.ownership_verification_method AS profile_ownership_verification_method,
  therapist.ownership_verified_at AS profile_ownership_verified_at,
  request.requester_name,
  request.requester_email,
  request.requester_phone,
  request.note AS request_note,
  request.review_note,
  request.reviewed_by,
  CASE
    WHEN request.status = 'approved' THEN 'request_approved'
    WHEN request.status = 'rejected' THEN 'request_rejected'
    WHEN request.status = 'cancelled' THEN 'request_cancelled'
    WHEN request.status = 'pending' AND request.reviewed_by IS NOT NULL THEN 'request_verification_pending'
    ELSE 'request_pending'
  END::text AS status,
  CASE
    WHEN request.status = 'pending' AND request.reviewed_by IS NULL THEN 0
    WHEN request.status = 'pending' AND request.reviewed_by IS NOT NULL THEN 3
    ELSE 4
  END::integer AS attention_rank,
  request.created_at,
  NULL::timestamptz AS sent_at,
  NULL::timestamptz AS accepted_at,
  NULL::timestamptz AS expires_at,
  NULL::timestamptz AS revoked_at,
  request.reviewed_at AS resolved_at,
  NULL::uuid AS source_lead_id,
  NULL::text AS provider_message_id,
  NULL::text AS last_delivery_error,
  request.verification_method,
  CASE
    WHEN request.request_type = 'claim_profile'
      AND request.status = 'pending'
      AND request.reviewed_by IS NOT NULL THEN 'email'
    WHEN request.verification_method = 'existing_email' THEN 'email'
    WHEN request.verification_method = 'existing_phone' THEN 'phone'
    WHEN request.verification_method = 'manual_review' THEN 'manual_review'
    ELSE 'unverified'
  END::text AS verification_category,
  pg_catalog.concat_ws(
    ' ',
    therapist.full_name,
    therapist.professional_title,
    therapist.email,
    request.requester_name,
    request.requester_email,
    request.requester_phone,
    therapist.id::text,
    request.id::text
  ) AS search_text
FROM public.therapist_profile_requests AS request
JOIN public.therapists AS therapist ON therapist.id = request.therapist_id;

REVOKE ALL ON TABLE public.admin_profile_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_profile_claims TO service_role;

CREATE INDEX IF NOT EXISTS therapist_profile_requests_status_created_idx
  ON public.therapist_profile_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS therapist_profile_requests_type_created_idx
  ON public.therapist_profile_requests(request_type, created_at DESC);
-- At most one public ownership request for a profile can be explicitly
-- advanced to email verification at a time. This keeps invite acceptance
-- auditable even when several people submitted claim requests for one profile.
CREATE UNIQUE INDEX IF NOT EXISTS therapist_profile_requests_one_claim_verification_idx
  ON public.therapist_profile_requests(therapist_id)
  WHERE request_type = 'claim_profile'
    AND status = 'pending'
    AND reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS therapist_claim_invites_status_created_idx
  ON public.therapist_claim_invites(status, created_at DESC);


-- Keep the audit trail accurate when an email invitation is accepted: only a
-- public ownership request that an admin explicitly advanced to verification
-- is approved. Other still-open ownership requests for the now-owned profile
-- are cancelled rather than falsely marked as approved.
CREATE OR REPLACE FUNCTION public.claim_therapist_by_invite(
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
      AND status = 'pending'
      AND reviewed_by IS NOT NULL;

  UPDATE public.therapist_profile_requests
    SET status = 'cancelled',
        review_note = coalesce(review_note, 'הפרופיל שויך לבעליו באמצעות אימייל מקצועי מאומת.'),
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

COMMIT;

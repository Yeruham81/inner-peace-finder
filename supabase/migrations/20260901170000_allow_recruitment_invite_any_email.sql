-- Allow a valid therapist recruitment invitation to be claimed by any authenticated
-- account with a verified email address. The destination email remains recruitment
-- delivery/suppression metadata only; it no longer constrains the account login email.

BEGIN;

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

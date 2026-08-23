BEGIN;

ALTER TABLE public.therapist_accounts
  ADD COLUMN IF NOT EXISTS credential_verification_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method_status text NOT NULL DEFAULT 'not_configured';

ALTER TABLE public.therapist_accounts
  DROP CONSTRAINT IF EXISTS therapist_accounts_payment_method_status_check;
ALTER TABLE public.therapist_accounts
  ADD CONSTRAINT therapist_accounts_payment_method_status_check
  CHECK (payment_method_status IN ('not_configured', 'active', 'action_required', 'expired'));

-- Billing is not enforced while the provider is unconfigured. Once a provider
-- marks an account active, a later action_required/expired transition pauses
-- the profile without changing its publication status or visibility choice.
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS billing_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active_before_billing_hold boolean;

CREATE OR REPLACE FUNCTION public.enforce_therapist_billing_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_payment_status text;
BEGIN
  IF NEW.owner_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account.payment_method_status
    INTO v_payment_status
    FROM public.therapist_accounts AS account
   WHERE account.id = NEW.owner_account_id;

  IF v_payment_status IN ('action_required', 'expired') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_active_before_billing_hold := NEW.is_active;
    ELSIF NOT OLD.billing_hold THEN
      NEW.is_active_before_billing_hold := NEW.is_active;
    ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      -- Preserve the latest intended active state while the billing hold keeps
      -- the effective state false.
      NEW.is_active_before_billing_hold := NEW.is_active;
    END IF;
    NEW.billing_hold := true;
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_therapist_billing_hold ON public.therapists;
CREATE TRIGGER trg_enforce_therapist_billing_hold
  BEFORE INSERT OR UPDATE OF owner_account_id, is_active, billing_hold
  ON public.therapists
  FOR EACH ROW EXECUTE FUNCTION public.enforce_therapist_billing_hold();

CREATE OR REPLACE FUNCTION public.sync_account_payment_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.payment_method_status IN ('action_required', 'expired') THEN
    UPDATE public.therapists
       SET billing_hold = true
     WHERE owner_account_id = NEW.id
       AND NOT billing_hold;
  ELSIF NEW.payment_method_status = 'active' THEN
    UPDATE public.therapists
       SET billing_hold = false,
           is_active = COALESCE(is_active_before_billing_hold, is_active),
           is_active_before_billing_hold = NULL
     WHERE owner_account_id = NEW.id
       AND billing_hold;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_sync_account_payment_hold ON public.therapist_accounts;
CREATE TRIGGER trg_sync_account_payment_hold
  AFTER UPDATE OF payment_method_status
  ON public.therapist_accounts
  FOR EACH ROW
  WHEN (OLD.payment_method_status IS DISTINCT FROM NEW.payment_method_status)
  EXECUTE FUNCTION public.sync_account_payment_hold();

CREATE OR REPLACE FUNCTION public.set_my_credential_verification_skip(_skip boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_account_id uuid;
  v_skipped_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT account.id
    INTO v_account_id
    FROM public.therapist_accounts AS account
   WHERE account.auth_user_id = auth.uid();

  IF v_account_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.therapists AS therapist
     WHERE therapist.owner_account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'owned profile required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.therapist_accounts
     SET credential_verification_skipped_at = CASE WHEN _skip THEN now() ELSE NULL END
   WHERE id = v_account_id
  RETURNING credential_verification_skipped_at INTO v_skipped_at;

  RETURN v_skipped_at;
END
$fn$;

REVOKE ALL ON FUNCTION public.set_my_credential_verification_skip(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_credential_verification_skip(boolean) TO authenticated;

COMMIT;

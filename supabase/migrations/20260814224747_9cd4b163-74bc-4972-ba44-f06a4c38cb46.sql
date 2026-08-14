CREATE OR REPLACE FUNCTION public.enforce_therapist_account_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  -- A signed-in user may create only their own account row, and never choose
  -- its status: those transitions belong to the platform's own workflows.
  IF auth.role() = 'authenticated' THEN
    NEW.account_status := 'pending'::public.therapist_account_status;
    NEW.onboarding_completed := false;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_therapist_account_defaults ON public.therapist_accounts;
CREATE TRIGGER enforce_therapist_account_defaults
  BEFORE INSERT ON public.therapist_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_therapist_account_defaults();

REVOKE ALL ON FUNCTION public.enforce_therapist_account_defaults() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_therapist_account_defaults() FROM anon, authenticated;
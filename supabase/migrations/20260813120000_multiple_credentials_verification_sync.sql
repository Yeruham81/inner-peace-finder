BEGIN;

-- Keep the public therapist badge/filter aligned with approved credentials.
-- The trigger is deliberately independent of the future admin UI: when an
-- authorized admin process changes a credential status, the public flag follows.
CREATE OR REPLACE FUNCTION public.sync_therapist_verified_from_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_therapist_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.verification_status <> 'verified' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.verification_status <> 'verified' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.verification_status <> 'verified'
     AND NEW.verification_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  affected_therapist_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.therapist_id ELSE NEW.therapist_id END;

  UPDATE public.therapists AS therapist
  SET verified = EXISTS (
    SELECT 1
    FROM public.therapist_credentials AS credential
    WHERE credential.therapist_id = affected_therapist_id
      AND credential.verification_status = 'verified'
  )
  WHERE therapist.id = affected_therapist_id
    AND therapist.verified IS DISTINCT FROM EXISTS (
      SELECT 1
      FROM public.therapist_credentials AS credential
      WHERE credential.therapist_id = affected_therapist_id
        AND credential.verification_status = 'verified'
    );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_therapist_verified_from_credentials() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_therapist_verified_after_credential_change
  ON public.therapist_credentials;
CREATE TRIGGER sync_therapist_verified_after_credential_change
AFTER INSERT OR DELETE OR UPDATE OF verification_status
ON public.therapist_credentials
FOR EACH ROW
EXECUTE FUNCTION public.sync_therapist_verified_from_credentials();

-- Preserve existing legacy/demo verification flags. This one-way backfill only
-- promotes profiles for which an already-approved credential exists.
UPDATE public.therapists AS therapist
SET verified = true
WHERE therapist.verified = false
  AND EXISTS (
    SELECT 1
    FROM public.therapist_credentials AS credential
    WHERE credential.therapist_id = therapist.id
      AND credential.verification_status = 'verified'
  );

COMMIT;

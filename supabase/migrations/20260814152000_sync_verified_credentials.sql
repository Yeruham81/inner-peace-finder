BEGIN;

-- `therapists.verified` predates the credential workflow. Preserve every
-- existing manually/grandfathered badge before turning `verified` into the
-- searchable projection of manual verification OR a verified credential.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'therapists'
      AND column_name = 'manual_verified'
  ) THEN
    ALTER TABLE public.therapists ADD COLUMN manual_verified boolean;
    UPDATE public.therapists SET manual_verified = verified;
  END IF;
END;
$migration$;

-- Complete a previously interrupted application safely.
UPDATE public.therapists SET manual_verified = false WHERE manual_verified IS NULL;
ALTER TABLE public.therapists
  ALTER COLUMN manual_verified SET DEFAULT false,
  ALTER COLUMN manual_verified SET NOT NULL;

COMMENT ON COLUMN public.therapists.manual_verified IS
  'Administrator-controlled verification independent of therapist_credentials; therapists.verified is the searchable combined projection.';

-- Owners have table-level UPDATE privileges for their own row. Enforce the
-- verification projection in the database so an authenticated owner cannot
-- self-verify with a direct API request.
CREATE OR REPLACE FUNCTION public.enforce_therapist_verification_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.manual_verified, false) OR COALESCE(NEW.verified, false) THEN
        RAISE EXCEPTION 'verification fields are administrator controlled'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.manual_verified IS DISTINCT FROM OLD.manual_verified
       OR NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'verification fields are administrator controlled'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.manual_verified := COALESCE(NEW.manual_verified, false);
  NEW.verified := NEW.manual_verified OR EXISTS (
    SELECT 1
    FROM public.therapist_credentials AS credential
    WHERE credential.therapist_id = NEW.id
      AND credential.verification_status = 'verified'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_therapist_verification_projection ON public.therapists;
CREATE TRIGGER enforce_therapist_verification_projection
  BEFORE INSERT OR UPDATE OF manual_verified, verified ON public.therapists
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_therapist_verification_projection();

-- Recompute the combined badge whenever a credential can start or stop
-- contributing to it. A service-role reassignment also refreshes both the old
-- and new therapist rows.
CREATE OR REPLACE FUNCTION public.sync_therapist_verified_from_credentials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_therapist_id uuid;
BEGIN
  affected_therapist_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.therapist_id
    ELSE NEW.therapist_id
  END;

  UPDATE public.therapists AS therapist
  SET verified = therapist.manual_verified OR EXISTS (
    SELECT 1
    FROM public.therapist_credentials AS credential
    WHERE credential.therapist_id = affected_therapist_id
      AND credential.verification_status = 'verified'
  )
  WHERE therapist.id = affected_therapist_id
    AND therapist.verified IS DISTINCT FROM (
      therapist.manual_verified OR EXISTS (
        SELECT 1
        FROM public.therapist_credentials AS credential
        WHERE credential.therapist_id = affected_therapist_id
          AND credential.verification_status = 'verified'
      )
    );

  IF TG_OP = 'UPDATE'
     AND OLD.therapist_id IS DISTINCT FROM NEW.therapist_id THEN
    UPDATE public.therapists AS therapist
    SET verified = therapist.manual_verified OR EXISTS (
      SELECT 1
      FROM public.therapist_credentials AS credential
      WHERE credential.therapist_id = OLD.therapist_id
        AND credential.verification_status = 'verified'
    )
    WHERE therapist.id = OLD.therapist_id
      AND therapist.verified IS DISTINCT FROM (
        therapist.manual_verified OR EXISTS (
          SELECT 1
          FROM public.therapist_credentials AS credential
          WHERE credential.therapist_id = OLD.therapist_id
            AND credential.verification_status = 'verified'
        )
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the production-only trigger as well as any earlier repository name.
DROP TRIGGER IF EXISTS sync_therapist_verified_after_credential_change
  ON public.therapist_credentials;
DROP TRIGGER IF EXISTS trg_sync_therapist_verified_from_credentials
  ON public.therapist_credentials;

CREATE TRIGGER sync_therapist_verified_after_credential_change
  AFTER INSERT OR DELETE OR UPDATE OF verification_status, therapist_id
  ON public.therapist_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_therapist_verified_from_credentials();

-- Backfill every row. Existing badges were copied to `manual_verified`, so the
-- nine historical mock badges remain intact while credential-derived badges
-- become available to cards, ranking and the verified-only search filter.
UPDATE public.therapists AS therapist
SET verified = therapist.manual_verified OR EXISTS (
  SELECT 1
  FROM public.therapist_credentials AS credential
  WHERE credential.therapist_id = therapist.id
    AND credential.verification_status = 'verified'
)
WHERE therapist.verified IS DISTINCT FROM (
  therapist.manual_verified OR EXISTS (
    SELECT 1
    FROM public.therapist_credentials AS credential
    WHERE credential.therapist_id = therapist.id
      AND credential.verification_status = 'verified'
  )
);

REVOKE ALL ON FUNCTION public.enforce_therapist_verification_projection()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_therapist_verified_from_credentials()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_therapist_verification_projection()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_therapist_verified_from_credentials()
  TO service_role;

COMMIT;

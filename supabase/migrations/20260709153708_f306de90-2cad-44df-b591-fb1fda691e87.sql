
-- ============================================================
-- Platform P2 — Profile claiming, credential foundation,
-- entity-search index. No semantic-engine changes.
-- ============================================================

-- 1) Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.claim_request_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.credential_verification_status AS ENUM
    ('unverified','pending_review','verified','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) therapist_claim_requests ------------------------------------------
CREATE TABLE IF NOT EXISTS public.therapist_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  requester_account_id uuid NOT NULL REFERENCES public.therapist_accounts(id) ON DELETE CASCADE,
  status public.claim_request_status NOT NULL DEFAULT 'pending',
  verification_method text,
  verification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapist_claim_requests_therapist_idx
  ON public.therapist_claim_requests(therapist_id);
CREATE INDEX IF NOT EXISTS therapist_claim_requests_requester_idx
  ON public.therapist_claim_requests(requester_account_id);

-- At most one active (pending/approved) request per therapist.
CREATE UNIQUE INDEX IF NOT EXISTS therapist_claim_requests_active_key
  ON public.therapist_claim_requests(therapist_id)
  WHERE status IN ('pending','approved');

-- A requester cannot have two open requests for the same therapist.
CREATE UNIQUE INDEX IF NOT EXISTS therapist_claim_requests_requester_open_key
  ON public.therapist_claim_requests(therapist_id, requester_account_id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON public.therapist_claim_requests TO authenticated;
GRANT ALL ON public.therapist_claim_requests TO service_role;

ALTER TABLE public.therapist_claim_requests ENABLE ROW LEVEL SECURITY;

-- Requesters see only their own requests.
CREATE POLICY "Requester reads own claim requests"
  ON public.therapist_claim_requests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapist_accounts a
    WHERE a.id = requester_account_id AND a.auth_user_id = auth.uid()
  ));

-- Requester may insert a request FOR THEMSELVES against an unclaimed profile.
CREATE POLICY "Requester creates own claim request"
  ON public.therapist_claim_requests FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = requester_account_id AND a.auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.therapists t
      WHERE t.id = therapist_id AND t.owner_account_id IS NULL
    )
  );

-- Requester may only cancel their own pending request (status → cancelled).
CREATE POLICY "Requester cancels own pending request"
  ON public.therapist_claim_requests FOR UPDATE TO authenticated
  USING (
    status = 'pending' AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = requester_account_id AND a.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'cancelled' AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = requester_account_id AND a.auth_user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_therapist_claim_requests_updated_at
  BEFORE UPDATE ON public.therapist_claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) therapist_credentials --------------------------------------------
CREATE TABLE IF NOT EXISTS public.therapist_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  profession_id uuid REFERENCES public.professions(id) ON DELETE SET NULL,
  credential_type text NOT NULL,
  institution text,
  license_number text,
  document_url text,
  verification_status public.credential_verification_status NOT NULL DEFAULT 'unverified',
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapist_credentials_therapist_idx
  ON public.therapist_credentials(therapist_id);
CREATE INDEX IF NOT EXISTS therapist_credentials_status_idx
  ON public.therapist_credentials(verification_status);

GRANT SELECT ON public.therapist_credentials TO authenticated;
GRANT ALL ON public.therapist_credentials TO service_role;

ALTER TABLE public.therapist_credentials ENABLE ROW LEVEL SECURITY;

-- Owner of the therapist profile can read their own credentials.
CREATE POLICY "Owner reads own credentials"
  ON public.therapist_credentials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ));

-- Writes reserved for service role / future verification workflow.

CREATE TRIGGER trg_therapist_credentials_updated_at
  BEFORE UPDATE ON public.therapist_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Approval helper (security definer) -------------------------------
-- Atomically links the therapist to the requester's account and marks the
-- claim approved. Used by the future admin workflow / service role.
CREATE OR REPLACE FUNCTION public.approve_therapist_claim(_claim_id uuid, _reviewer uuid)
RETURNS public.therapist_claim_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim public.therapist_claim_requests;
BEGIN
  SELECT * INTO claim FROM public.therapist_claim_requests
    WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  IF claim.status <> 'pending' THEN
    RAISE EXCEPTION 'claim is not pending (status=%)', claim.status;
  END IF;

  UPDATE public.therapists
    SET owner_account_id = claim.requester_account_id
    WHERE id = claim.therapist_id AND owner_account_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'therapist already owned';
  END IF;

  UPDATE public.therapist_accounts
    SET account_status = 'claimed'
    WHERE id = claim.requester_account_id;

  UPDATE public.therapist_claim_requests
    SET status = 'approved', reviewed_by = _reviewer, reviewed_at = now()
    WHERE id = _claim_id
    RETURNING * INTO claim;
  RETURN claim;
END $$;

REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_therapist_claim(uuid, uuid) TO service_role;

-- 5) Entity-search index on therapist name / title --------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS therapists_full_name_trgm_idx
  ON public.therapists USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS therapists_professional_title_trgm_idx
  ON public.therapists USING gin (professional_title gin_trgm_ops);

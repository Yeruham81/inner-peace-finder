
-- Visibility column
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS visibility public.therapist_visibility NOT NULL DEFAULT 'published';
CREATE INDEX IF NOT EXISTS therapists_visibility_idx ON public.therapists(visibility);

-- Claim request extra columns
ALTER TABLE public.therapist_claim_requests
  ADD COLUMN IF NOT EXISTS request_type public.claim_request_type NOT NULL DEFAULT 'claim_profile',
  ADD COLUMN IF NOT EXISTS note text;

-- Uniqueness scoped by request_type
DROP INDEX IF EXISTS public.therapist_claim_requests_active_key;
DROP INDEX IF EXISTS public.therapist_claim_requests_requester_open_key;

CREATE UNIQUE INDEX IF NOT EXISTS therapist_claim_requests_active_key
  ON public.therapist_claim_requests(therapist_id, request_type)
  WHERE status IN ('pending','approved','needs_information');

CREATE UNIQUE INDEX IF NOT EXISTS therapist_claim_requests_requester_open_key
  ON public.therapist_claim_requests(therapist_id, requester_account_id, request_type)
  WHERE status IN ('pending','needs_information');

-- Update the UPDATE policy to allow cancelling from pending OR needs_information
DROP POLICY IF EXISTS "Requester cancels own pending request" ON public.therapist_claim_requests;
DROP POLICY IF EXISTS "Requester cancels own open request" ON public.therapist_claim_requests;
CREATE POLICY "Requester cancels own open request"
  ON public.therapist_claim_requests FOR UPDATE TO authenticated
  USING (
    status IN ('pending','needs_information') AND EXISTS (
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

-- Notification event queue
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  claim_request_id uuid REFERENCES public.therapist_claim_requests(id) ON DELETE CASCADE,
  recipient_account_id uuid REFERENCES public.therapist_accounts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_events_status_idx
  ON public.notification_events(status, created_at);

GRANT ALL ON public.notification_events TO service_role;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
-- Service role only; no anon/authenticated policies.

DROP TRIGGER IF EXISTS trg_notification_events_updated_at ON public.notification_events;
CREATE TRIGGER trg_notification_events_updated_at
  BEFORE UPDATE ON public.notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enqueue notification on claim request insert / status change
CREATE OR REPLACE FUNCTION public.enqueue_claim_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := 'request_submitted';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    ev := CASE NEW.status::text
      WHEN 'approved' THEN 'request_approved'
      WHEN 'rejected' THEN 'request_rejected'
      WHEN 'needs_information' THEN 'request_needs_information'
      ELSE NULL
    END;
  END IF;
  IF ev IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_type, claim_request_id, recipient_account_id, payload)
  VALUES (
    ev,
    NEW.id,
    NEW.requester_account_id,
    jsonb_build_object(
      'request_type', NEW.request_type,
      'verification_method', NEW.verification_method,
      'therapist_id', NEW.therapist_id,
      'status', NEW.status
    )
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_claim_notification() FROM public;

DROP TRIGGER IF EXISTS trg_claim_notify_insert ON public.therapist_claim_requests;
CREATE TRIGGER trg_claim_notify_insert
  AFTER INSERT ON public.therapist_claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_claim_notification();

DROP TRIGGER IF EXISTS trg_claim_notify_update ON public.therapist_claim_requests;
CREATE TRIGGER trg_claim_notify_update
  AFTER UPDATE ON public.therapist_claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_claim_notification();

-- Extend approve helper for both request types
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
  IF claim.status NOT IN ('pending','needs_information') THEN
    RAISE EXCEPTION 'claim is not open (status=%)', claim.status;
  END IF;

  IF claim.request_type = 'claim_profile' THEN
    UPDATE public.therapists
      SET owner_account_id = claim.requester_account_id,
          profile_claimed = true
      WHERE id = claim.therapist_id AND owner_account_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'therapist already owned';
    END IF;
    UPDATE public.therapist_accounts
      SET account_status = 'claimed'
      WHERE id = claim.requester_account_id;
  ELSIF claim.request_type = 'remove_profile' THEN
    UPDATE public.therapists
      SET visibility = 'hidden_by_owner',
          is_active = false
      WHERE id = claim.therapist_id;
  END IF;

  UPDATE public.therapist_claim_requests
    SET status = 'approved', reviewed_by = _reviewer, reviewed_at = now()
    WHERE id = _claim_id
    RETURNING * INTO claim;
  RETURN claim;
END $$;

REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_therapist_claim(uuid, uuid) TO service_role;

-- Reject / needs_information transition helper
CREATE OR REPLACE FUNCTION public.set_claim_request_status(
  _claim_id uuid, _reviewer uuid, _new_status public.claim_request_status
)
RETURNS public.therapist_claim_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE claim public.therapist_claim_requests;
BEGIN
  IF _new_status NOT IN ('rejected','needs_information','pending') THEN
    RAISE EXCEPTION 'unsupported status transition: %', _new_status;
  END IF;
  UPDATE public.therapist_claim_requests
    SET status = _new_status, reviewed_by = _reviewer, reviewed_at = now()
    WHERE id = _claim_id
    RETURNING * INTO claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  RETURN claim;
END $$;

REVOKE ALL ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) FROM public;
GRANT EXECUTE ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) TO service_role;

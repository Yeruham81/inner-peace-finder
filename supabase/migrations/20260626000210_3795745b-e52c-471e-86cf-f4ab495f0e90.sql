
-- 1) Extend therapists with contact channel preference
DO $$ BEGIN
  CREATE TYPE public.contact_channel AS ENUM ('whatsapp', 'sms', 'email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS preferred_contact_channel public.contact_channel NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS contact_destination text;

-- Backfill contact_destination from existing phone where missing
UPDATE public.therapists
SET contact_destination = phone
WHERE contact_destination IS NULL AND phone IS NOT NULL;

-- 2) lead_events
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cta_event_id uuid REFERENCES public.cta_clicks(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  problem_id uuid,
  population_id uuid,
  visitor_name text NOT NULL,
  visitor_phone text NOT NULL,
  message text NOT NULL,
  challenge_presented text,
  challenge_passed boolean NOT NULL DEFAULT false,
  delivery_channel text,
  delivery_status text NOT NULL DEFAULT 'pending',
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_events_therapist_created_idx
  ON public.lead_events (therapist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_events_session_idx
  ON public.lead_events (session_id);

-- Grants: client never reads or writes this table directly; backend uses service_role
GRANT ALL ON public.lead_events TO service_role;

ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies — table is backend-only.
-- service_role bypasses RLS, so no policy needed for it.

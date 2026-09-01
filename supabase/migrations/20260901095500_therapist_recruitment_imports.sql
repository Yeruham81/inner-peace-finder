-- Therapist recruitment invitation foundation.
-- Phase 1 only: import, deduplication, suppression and admin preview/storage.
-- No provider delivery is performed by this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.therapist_recruitment_import_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  channel text NOT NULL,
  source_filename text,
  created_by uuid NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  eligible_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  already_invited_rows integer NOT NULL DEFAULT 0,
  already_registered_rows integer NOT NULL DEFAULT 0,
  existing_profile_rows integer NOT NULL DEFAULT 0,
  suppressed_rows integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT therapist_recruitment_import_batches_channel_check
    CHECK (channel IN ('email', 'sms', 'whatsapp')),
  CONSTRAINT therapist_recruitment_import_batches_counts_check
    CHECK (
      total_rows >= 0
      AND eligible_rows >= 0
      AND imported_rows >= 0
      AND invalid_rows >= 0
      AND duplicate_rows >= 0
      AND already_invited_rows >= 0
      AND already_registered_rows >= 0
      AND existing_profile_rows >= 0
      AND suppressed_rows >= 0
    )
);

CREATE TABLE IF NOT EXISTS public.therapist_recruitment_invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  import_batch_id uuid REFERENCES public.therapist_recruitment_import_batches(id) ON DELETE SET NULL,
  channel text NOT NULL,
  destination_normalized text NOT NULL,
  first_name text,
  last_name text,
  search_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready',
  provider text,
  provider_message_id text,
  submission_started_at timestamptz,
  submitted_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  declined_at timestamptz,
  decline_source text,
  registered_at timestamptz,
  registered_account_id uuid REFERENCES public.therapist_accounts(id) ON DELETE SET NULL,
  registered_therapist_id uuid REFERENCES public.therapists(id) ON DELETE SET NULL,
  failure_code text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT therapist_recruitment_invitations_name_length_check
    CHECK (pg_catalog.length(coalesce(first_name, '')) <= 120 AND pg_catalog.length(coalesce(last_name, '')) <= 120),
  CONSTRAINT therapist_recruitment_invitations_channel_check
    CHECK (channel IN ('email', 'sms', 'whatsapp')),
  CONSTRAINT therapist_recruitment_invitations_status_check
    CHECK (status IN (
      'ready',
      'submitting',
      'submitted',
      'delivered',
      'bounced',
      'declined',
      'registered',
      'submission_failed',
      'submission_unknown'
    )),
  CONSTRAINT therapist_recruitment_invitations_destination_check
    CHECK (
      (channel = 'email'
        AND destination_normalized = pg_catalog.lower(pg_catalog.btrim(destination_normalized))
        AND pg_catalog.length(destination_normalized) BETWEEN 3 AND 320
        AND pg_catalog.strpos(destination_normalized, '@') > 1)
      OR
      (channel IN ('sms', 'whatsapp')
        AND destination_normalized ~ '^\\+[1-9][0-9]{7,14}$')
    ),
  CONSTRAINT therapist_recruitment_invitations_provider_message_unique
    UNIQUE (provider, provider_message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS therapist_recruitment_invitations_channel_destination_key
  ON public.therapist_recruitment_invitations(channel, destination_normalized);

CREATE INDEX IF NOT EXISTS therapist_recruitment_invitations_status_created_idx
  ON public.therapist_recruitment_invitations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS therapist_recruitment_invitations_batch_idx
  ON public.therapist_recruitment_invitations(import_batch_id);

CREATE TABLE IF NOT EXISTS public.therapist_recruitment_suppressions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  channel text NOT NULL,
  destination_normalized text NOT NULL,
  source text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT therapist_recruitment_suppressions_channel_check
    CHECK (channel IN ('email', 'sms', 'whatsapp')),
  CONSTRAINT therapist_recruitment_suppressions_source_check
    CHECK (source IN ('recipient_opt_out', 'admin', 'provider', 'legacy')),
  CONSTRAINT therapist_recruitment_suppressions_destination_check
    CHECK (
      (channel = 'email'
        AND destination_normalized = pg_catalog.lower(pg_catalog.btrim(destination_normalized))
        AND pg_catalog.length(destination_normalized) BETWEEN 3 AND 320
        AND pg_catalog.strpos(destination_normalized, '@') > 1)
      OR
      (channel IN ('sms', 'whatsapp')
        AND destination_normalized ~ '^\\+[1-9][0-9]{7,14}$')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS therapist_recruitment_suppressions_channel_destination_key
  ON public.therapist_recruitment_suppressions(channel, destination_normalized);

CREATE OR REPLACE FUNCTION public.set_therapist_recruitment_search_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.search_text := pg_catalog.lower(
    pg_catalog.concat_ws(
      ' ',
      NEW.destination_normalized,
      coalesce(NEW.first_name, ''),
      coalesce(NEW.last_name, '')
    )
  );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_therapist_recruitment_search_text()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_therapist_recruitment_search_text
  ON public.therapist_recruitment_invitations;
CREATE TRIGGER trg_therapist_recruitment_search_text
  BEFORE INSERT OR UPDATE OF destination_normalized, first_name, last_name
  ON public.therapist_recruitment_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_therapist_recruitment_search_text();

DROP TRIGGER IF EXISTS trg_therapist_recruitment_invitations_updated_at
  ON public.therapist_recruitment_invitations;
CREATE TRIGGER trg_therapist_recruitment_invitations_updated_at
  BEFORE UPDATE ON public.therapist_recruitment_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_therapist_recruitment_suppressions_updated_at
  ON public.therapist_recruitment_suppressions;
CREATE TRIGGER trg_therapist_recruitment_suppressions_updated_at
  BEFORE UPDATE ON public.therapist_recruitment_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.therapist_recruitment_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_recruitment_suppressions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.therapist_recruitment_import_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.therapist_recruitment_invitations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.therapist_recruitment_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.therapist_recruitment_import_batches TO service_role;
GRANT ALL ON TABLE public.therapist_recruitment_invitations TO service_role;
GRANT ALL ON TABLE public.therapist_recruitment_suppressions TO service_role;

COMMENT ON TABLE public.therapist_recruitment_invitations IS
  'One durable recruitment invitation record per normalized destination and channel. Provider submission retries reuse the same row; a bounced or declined invitation is never recreated.';

COMMENT ON COLUMN public.therapist_recruitment_invitations.submitted_at IS
  'Set only when the delivery provider has accepted the message for processing. Once set, the one-invitation rule is consumed even if delivery later bounces.';

COMMENT ON COLUMN public.therapist_recruitment_invitations.status IS
  'submission_failed means the provider did not accept the message and a controlled retry may reuse this row; submission_unknown must never retry automatically.';

COMMENT ON TABLE public.therapist_recruitment_suppressions IS
  'Channel-scoped recruitment opt-out registry. It is intentionally separate from the broader contact_email_suppressions registry.';

-- Service-role-only matcher used by the admin import preview. It detects existing
-- therapist accounts, existing profile records and the pre-existing global email
-- suppression registry without exposing auth.users or suppression data publicly.
CREATE OR REPLACE FUNCTION public.get_recruitment_email_conflicts(_emails text[])
RETURNS TABLE (
  email_normalized text,
  already_registered boolean,
  existing_profile boolean,
  globally_suppressed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH requested AS (
    SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(value)) AS email_normalized
    FROM pg_catalog.unnest(coalesce(_emails, ARRAY[]::text[])) AS item(value)
    WHERE value IS NOT NULL
      AND pg_catalog.btrim(value) <> ''
  )
  SELECT
    requested.email_normalized,
    EXISTS (
      SELECT 1
      FROM auth.users AS auth_user
      JOIN public.therapist_accounts AS account
        ON account.auth_user_id = auth_user.id
      WHERE pg_catalog.lower(pg_catalog.btrim(auth_user.email)) = requested.email_normalized
    ) AS already_registered,
    EXISTS (
      SELECT 1
      FROM public.therapists AS therapist
      WHERE therapist.email IS NOT NULL
        AND pg_catalog.lower(pg_catalog.btrim(therapist.email)) = requested.email_normalized
    ) AS existing_profile,
    EXISTS (
      SELECT 1
      FROM public.contact_email_suppressions AS suppression
      WHERE suppression.email_normalized = requested.email_normalized
    ) AS globally_suppressed
  FROM requested;
$fn$;

REVOKE ALL ON FUNCTION public.get_recruitment_email_conflicts(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recruitment_email_conflicts(text[])
  TO service_role;

COMMIT;

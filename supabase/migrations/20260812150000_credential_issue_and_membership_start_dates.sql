BEGIN;

-- Keep the legacy expiry field intact, but collect the date on which the
-- qualification or credential was granted / became effective going forward.
ALTER TABLE public.therapist_credentials
  ADD COLUMN IF NOT EXISTS issue_date date;

ALTER TABLE public.therapist_credentials
  DROP CONSTRAINT IF EXISTS therapist_credentials_issue_date_check,
  ADD CONSTRAINT therapist_credentials_issue_date_check
    CHECK (issue_date IS NULL OR issue_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31');

-- The existing column stores only a legacy year. A separate date avoids
-- inventing a day and month for existing records.
ALTER TABLE public.therapist_professional_memberships
  ADD COLUMN IF NOT EXISTS membership_start_date date;

ALTER TABLE public.therapist_professional_memberships
  DROP CONSTRAINT IF EXISTS therapist_membership_start_date_check,
  ADD CONSTRAINT therapist_membership_start_date_check CHECK (
    membership_start_date IS NULL
      OR membership_start_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
  );

-- Credential writes use column-level grants so the new owner-editable field
-- must be granted explicitly. Verification fields remain service-role only.
GRANT INSERT (issue_date) ON public.therapist_credentials TO authenticated;
GRANT UPDATE (issue_date) ON public.therapist_credentials TO authenticated;

COMMIT;

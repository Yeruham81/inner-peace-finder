-- ============================================================
-- Platform P3.1 — Therapist Profile Editor foundation
-- Draft/Completed/Published lifecycle + gender + contact email +
-- owner-scoped INSERT of own therapist row. Backfill existing rows
-- as 'published' to preserve public search behavior.
-- ============================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.therapist_gender AS ENUM ('male','female','unspecified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.therapist_profile_status AS ENUM ('draft','completed','published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Columns on therapists
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS gender public.therapist_gender,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS profile_status public.therapist_profile_status
    NOT NULL DEFAULT 'draft';

-- 3) Allow draft rows: relax NOT NULL on structured fields that must be
-- present only for a published profile (validated by the app before publish).
ALTER TABLE public.therapists
  ALTER COLUMN professional_title DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL;

-- 4) Backfill: any pre-existing therapist row is treated as published so
-- current public search / detail pages are unchanged.
UPDATE public.therapists
   SET profile_status = 'published'
 WHERE profile_status = 'draft';

-- 5) Index for public-visibility filtering
CREATE INDEX IF NOT EXISTS therapists_profile_status_idx
  ON public.therapists(profile_status);

-- 6) Ownership-scoped INSERT policy — a therapist account may create
-- exactly one owned profile row for itself. UNIQUE index on
-- (owner_account_id) already enforces the 1:1 constraint.
DROP POLICY IF EXISTS "Owner can insert own therapist row"
  ON public.therapists;
CREATE POLICY "Owner can insert own therapist row"
  ON public.therapists FOR INSERT TO authenticated
  WITH CHECK (
    owner_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = owner_account_id AND a.auth_user_id = auth.uid()
    )
  );

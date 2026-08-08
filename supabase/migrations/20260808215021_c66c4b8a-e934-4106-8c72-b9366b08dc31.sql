BEGIN;

-- 1) Remove the broad public read policy on the base table.
DROP POLICY IF EXISTS "Public read therapists" ON public.therapists;

-- 2) Anonymous role: no direct privileges of any kind on the base table.
REVOKE ALL PRIVILEGES ON TABLE public.therapists FROM anon;

-- 3) Ordinary authenticated users: only what the owner-editor flow needs.
REVOKE ALL PRIVILEGES ON TABLE public.therapists FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.therapists TO authenticated;

-- 4) Owner-scoped SELECT (INSERT/UPDATE owner policies already exist).
DROP POLICY IF EXISTS "Owner can read own therapist row" ON public.therapists;
CREATE POLICY "Owner can read own therapist row"
  ON public.therapists
  FOR SELECT
  TO authenticated
  USING (
    owner_account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = therapists.owner_account_id
        AND a.auth_user_id = auth.uid()
    )
  );

-- 5) Preserve privileged server/admin access explicitly.
GRANT ALL ON TABLE public.therapists TO service_role;

COMMIT;
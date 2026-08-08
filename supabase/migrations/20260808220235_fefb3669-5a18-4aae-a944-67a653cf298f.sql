BEGIN;

-- 1. Drop unrestricted public SELECT policies -------------------------------
DROP POLICY IF EXISTS "Public read therapist_locations" ON public.therapist_locations;
DROP POLICY IF EXISTS "Public read therapist_professions" ON public.therapist_professions;
DROP POLICY IF EXISTS "Public read therapist_modalities" ON public.therapist_modalities;
DROP POLICY IF EXISTS "Public read therapist_languages" ON public.therapist_languages;
DROP POLICY IF EXISTS "Public read therapist_populations" ON public.therapist_populations;

-- 2. Revoke all direct privileges from anon --------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.therapist_locations FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_professions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_modalities FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_languages FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_populations FROM anon;

-- 3. Narrow authenticated privileges to the owner-editor flow --------------
REVOKE ALL PRIVILEGES ON TABLE public.therapist_locations FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_professions FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_modalities FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_languages FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_populations FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.therapist_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.therapist_professions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.therapist_modalities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.therapist_languages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.therapist_populations TO authenticated;

-- 4. Preserve privileged server access -------------------------------------
GRANT ALL ON TABLE public.therapist_locations TO service_role;
GRANT ALL ON TABLE public.therapist_professions TO service_role;
GRANT ALL ON TABLE public.therapist_modalities TO service_role;
GRANT ALL ON TABLE public.therapist_languages TO service_role;
GRANT ALL ON TABLE public.therapist_populations TO service_role;

-- 5. Owner-scoped RLS ------------------------------------------------------
ALTER TABLE public.therapist_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_professions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_modalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_populations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage therapist_locations" ON public.therapist_locations;
CREATE POLICY "Owner manage therapist_locations"
  ON public.therapist_locations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_locations.therapist_id AND a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_locations.therapist_id AND a.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manage therapist_professions" ON public.therapist_professions;
CREATE POLICY "Owner manage therapist_professions"
  ON public.therapist_professions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_professions.therapist_id AND a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_professions.therapist_id AND a.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manage therapist_modalities" ON public.therapist_modalities;
CREATE POLICY "Owner manage therapist_modalities"
  ON public.therapist_modalities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_modalities.therapist_id AND a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_modalities.therapist_id AND a.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manage therapist_languages" ON public.therapist_languages;
CREATE POLICY "Owner manage therapist_languages"
  ON public.therapist_languages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_languages.therapist_id AND a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_languages.therapist_id AND a.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manage therapist_populations" ON public.therapist_populations;
CREATE POLICY "Owner manage therapist_populations"
  ON public.therapist_populations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_populations.therapist_id AND a.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t
                 JOIN public.therapist_accounts a ON a.id = t.owner_account_id
                 WHERE t.id = therapist_populations.therapist_id AND a.auth_user_id = auth.uid()));

COMMIT;
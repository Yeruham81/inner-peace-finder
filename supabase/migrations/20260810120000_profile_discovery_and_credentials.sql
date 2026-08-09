BEGIN;

-- Profile discovery attributes and private credential workflow.

-- 1. Therapy formats -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.therapy_formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_he text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT therapy_formats_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]*$')
);

INSERT INTO public.therapy_formats (slug, name_he, sort_order)
VALUES
  ('individual', 'טיפול פרטני', 10),
  ('couples', 'טיפול זוגי', 20),
  ('family', 'טיפול משפחתי', 30),
  ('parent_child', 'טיפול להורה וילד', 40),
  ('group', 'טיפול קבוצתי', 50),
  ('parent_guidance', 'הדרכת הורים', 60)
ON CONFLICT (slug) DO UPDATE
SET name_he = EXCLUDED.name_he,
    sort_order = EXCLUDED.sort_order,
    is_active = true;

CREATE TABLE IF NOT EXISTS public.therapist_therapy_formats (
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  therapy_format_id uuid NOT NULL REFERENCES public.therapy_formats(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (therapist_id, therapy_format_id)
);

GRANT SELECT ON public.therapy_formats TO anon, authenticated;
GRANT ALL ON public.therapy_formats TO service_role;
ALTER TABLE public.therapy_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active therapy formats" ON public.therapy_formats;
CREATE POLICY "Public read active therapy formats"
  ON public.therapy_formats FOR SELECT TO anon, authenticated
  USING (is_active = true);

REVOKE ALL PRIVILEGES ON TABLE public.therapist_therapy_formats FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.therapist_therapy_formats FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_therapy_formats TO authenticated;
GRANT ALL ON public.therapist_therapy_formats TO service_role;
ALTER TABLE public.therapist_therapy_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages therapist therapy formats" ON public.therapist_therapy_formats;
CREATE POLICY "Owner manages therapist therapy formats"
  ON public.therapist_therapy_formats FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_therapy_formats.therapist_id
      AND a.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_therapy_formats.therapist_id
      AND a.auth_user_id = auth.uid()
  ));

-- 2. Searchable profile declarations -------------------------------------
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS lgbtq_affirming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_free_intro boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_intro_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS free_intro_duration_minutes integer;

ALTER TABLE public.therapists
  DROP CONSTRAINT IF EXISTS therapists_free_intro_types_check,
  ADD CONSTRAINT therapists_free_intro_types_check
    CHECK (free_intro_types <@ ARRAY['phone', 'video', 'in_person']::text[]),
  DROP CONSTRAINT IF EXISTS therapists_free_intro_duration_check,
  ADD CONSTRAINT therapists_free_intro_duration_check
    CHECK (free_intro_duration_minutes IS NULL OR free_intro_duration_minutes BETWEEN 5 AND 120),
  DROP CONSTRAINT IF EXISTS therapists_free_intro_consistency_check,
  ADD CONSTRAINT therapists_free_intro_consistency_check CHECK (
    offers_free_intro
      OR (cardinality(free_intro_types) = 0 AND free_intro_duration_minutes IS NULL)
  );

CREATE INDEX IF NOT EXISTS therapists_lgbtq_affirming_idx
  ON public.therapists (lgbtq_affirming)
  WHERE lgbtq_affirming = true;

-- 3. Accessibility belongs to each physical location ---------------------
ALTER TABLE public.therapist_locations
  ADD COLUMN IF NOT EXISTS accessibility_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS accessibility_features text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS accessibility_note text;

ALTER TABLE public.therapist_locations
  DROP CONSTRAINT IF EXISTS therapist_locations_accessibility_status_check,
  ADD CONSTRAINT therapist_locations_accessibility_status_check
    CHECK (accessibility_status IN ('accessible', 'partially_accessible', 'not_accessible', 'unknown')),
  DROP CONSTRAINT IF EXISTS therapist_locations_accessibility_features_check,
  ADD CONSTRAINT therapist_locations_accessibility_features_check CHECK (
    accessibility_features <@ ARRAY[
      'step_free_entrance', 'accessible_elevator', 'accessible_restroom',
      'accessible_parking', 'wide_doorways', 'hearing_loop'
    ]::text[]
  ),
  DROP CONSTRAINT IF EXISTS therapist_locations_accessibility_note_length_check,
  ADD CONSTRAINT therapist_locations_accessibility_note_length_check
    CHECK (accessibility_note IS NULL OR char_length(accessibility_note) <= 500),
  DROP CONSTRAINT IF EXISTS therapist_locations_accessibility_clinic_only_check,
  ADD CONSTRAINT therapist_locations_accessibility_clinic_only_check CHECK (
    location_type = 'clinic'
      OR (accessibility_status = 'unknown' AND cardinality(accessibility_features) = 0 AND accessibility_note IS NULL)
  );

CREATE INDEX IF NOT EXISTS therapist_locations_accessible_clinic_idx
  ON public.therapist_locations (therapist_id)
  WHERE location_type = 'clinic' AND is_active = true AND accessibility_status = 'accessible';

-- 4. Self-declared display-only memberships and arrangements --------------
CREATE TABLE IF NOT EXISTS public.therapist_professional_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  member_since integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT therapist_membership_name_length CHECK (char_length(btrim(organization_name)) BETWEEN 2 AND 160),
  CONSTRAINT therapist_membership_year_check CHECK (member_since IS NULL OR member_since BETWEEN 1900 AND 2100),
  UNIQUE (therapist_id, organization_name)
);

CREATE TABLE IF NOT EXISTS public.therapist_service_arrangements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT therapist_arrangement_name_length CHECK (char_length(btrim(organization_name)) BETWEEN 2 AND 160),
  CONSTRAINT therapist_arrangement_note_length CHECK (note IS NULL OR char_length(note) <= 500),
  UNIQUE (therapist_id, organization_name)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'therapist_professional_memberships',
    'therapist_service_arrangements'
  ]
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Owner manages %s" ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE POLICY "Owner manages %s" ON public.%I FOR ALL TO authenticated '
      'USING (EXISTS (SELECT 1 FROM public.therapists t JOIN public.therapist_accounts a ON a.id = t.owner_account_id '
      'WHERE t.id = %I.therapist_id AND a.auth_user_id = auth.uid())) '
      'WITH CHECK (EXISTS (SELECT 1 FROM public.therapists t JOIN public.therapist_accounts a ON a.id = t.owner_account_id '
      'WHERE t.id = %I.therapist_id AND a.auth_user_id = auth.uid()))',
      table_name, table_name, table_name, table_name
    );
  END LOOP;
END $$;

-- 5. Extend the existing professional-credential workflow ----------------
ALTER TABLE public.therapist_credentials
  ADD COLUMN IF NOT EXISTS issuing_authority text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.therapist_credentials
  DROP CONSTRAINT IF EXISTS therapist_credentials_issuing_authority_length_check,
  ADD CONSTRAINT therapist_credentials_issuing_authority_length_check
    CHECK (issuing_authority IS NULL OR char_length(issuing_authority) <= 160),
  DROP CONSTRAINT IF EXISTS therapist_credentials_rejection_reason_length_check,
  ADD CONSTRAINT therapist_credentials_rejection_reason_length_check
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000);

-- Owners may submit and revise only credentials belonging to their profile.
-- The column-level GRANT prevents owners from approving themselves.
REVOKE ALL PRIVILEGES ON TABLE public.therapist_credentials FROM authenticated;
GRANT SELECT ON TABLE public.therapist_credentials TO authenticated;
GRANT INSERT (
  therapist_id, profession_id, credential_type, institution, license_number,
  document_url, issuing_authority, submitted_at, expires_at
) ON public.therapist_credentials TO authenticated;
GRANT UPDATE (
  profession_id, credential_type, institution, license_number,
  document_url, issuing_authority, submitted_at, expires_at
) ON public.therapist_credentials TO authenticated;
GRANT DELETE ON TABLE public.therapist_credentials TO authenticated;
GRANT ALL ON TABLE public.therapist_credentials TO service_role;

DROP POLICY IF EXISTS "Owner reads own credentials" ON public.therapist_credentials;
CREATE POLICY "Owner reads own credentials"
  ON public.therapist_credentials FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_credentials.therapist_id AND a.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Owner submits own credentials" ON public.therapist_credentials;
CREATE POLICY "Owner submits own credentials"
  ON public.therapist_credentials FOR INSERT TO authenticated
  WITH CHECK (
    verification_status IN ('unverified', 'pending_review')
    AND verified_by IS NULL AND verified_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.therapists t
      JOIN public.therapist_accounts a ON a.id = t.owner_account_id
      WHERE t.id = therapist_credentials.therapist_id AND a.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner revises own credentials" ON public.therapist_credentials;
CREATE POLICY "Owner revises own credentials"
  ON public.therapist_credentials FOR UPDATE TO authenticated
  USING (
    verification_status IN ('unverified', 'pending_review', 'rejected')
    AND EXISTS (
      SELECT 1 FROM public.therapists t
      JOIN public.therapist_accounts a ON a.id = t.owner_account_id
      WHERE t.id = therapist_credentials.therapist_id AND a.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    verification_status IN ('unverified', 'pending_review', 'rejected')
    AND verified_by IS NULL AND verified_at IS NULL
  );

DROP POLICY IF EXISTS "Owner deletes own unverified credentials" ON public.therapist_credentials;
CREATE POLICY "Owner deletes own unverified credentials"
  ON public.therapist_credentials FOR DELETE TO authenticated
  USING (
    verification_status IN ('unverified', 'pending_review', 'rejected')
    AND EXISTS (
      SELECT 1 FROM public.therapists t
      JOIN public.therapist_accounts a ON a.id = t.owner_account_id
      WHERE t.id = therapist_credentials.therapist_id AND a.auth_user_id = auth.uid()
    )
  );

-- Credential evidence is private. Objects use the path <auth.uid()>/<uuid>.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'therapist-credentials', 'therapist-credentials', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Owner reads credential documents" ON storage.objects;
CREATE POLICY "Owner reads credential documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'therapist-credentials' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner uploads credential documents" ON storage.objects;
CREATE POLICY "Owner uploads credential documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'therapist-credentials' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner updates credential documents" ON storage.objects;
CREATE POLICY "Owner updates credential documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'therapist-credentials' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'therapist-credentials' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner deletes credential documents" ON storage.objects;
CREATE POLICY "Owner deletes credential documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'therapist-credentials' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

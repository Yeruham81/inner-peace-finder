
-- ============================================================
-- Platform P1 — Therapist accounts, ownership, provider model,
-- locations. No changes to semantic engine or search behavior.
-- ============================================================

-- 1) Therapist account status enum
DO $$ BEGIN
  CREATE TYPE public.therapist_account_status AS ENUM ('pending','active','claimed','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) therapist_accounts (linked to auth.users, 1:1)
CREATE TABLE IF NOT EXISTS public.therapist_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarding_completed boolean NOT NULL DEFAULT false,
  account_status public.therapist_account_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.therapist_accounts TO authenticated;
GRANT ALL ON public.therapist_accounts TO service_role;

ALTER TABLE public.therapist_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account owner can read"
  ON public.therapist_accounts FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Account owner can insert self"
  ON public.therapist_accounts FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Account owner can update self"
  ON public.therapist_accounts FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- shared updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_therapist_accounts_updated_at
  BEFORE UPDATE ON public.therapist_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Ownership — nullable link from therapists to therapist_accounts.
-- Enforces 1:1 via UNIQUE (nulls allowed multiple times).
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS owner_account_id uuid
    REFERENCES public.therapist_accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS therapists_owner_account_id_key
  ON public.therapists(owner_account_id)
  WHERE owner_account_id IS NOT NULL;

-- 4) Provider model — professions
CREATE TABLE IF NOT EXISTS public.professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_he text NOT NULL,
  name_en text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.professions TO anon, authenticated;
GRANT ALL ON public.professions TO service_role;
ALTER TABLE public.professions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read professions" ON public.professions
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.therapist_professions (
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  profession_id uuid NOT NULL REFERENCES public.professions(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (therapist_id, profession_id)
);
CREATE INDEX IF NOT EXISTS therapist_professions_profession_idx
  ON public.therapist_professions(profession_id);
GRANT SELECT ON public.therapist_professions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.therapist_professions TO authenticated;
GRANT ALL ON public.therapist_professions TO service_role;
ALTER TABLE public.therapist_professions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_professions" ON public.therapist_professions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owner manage therapist_professions" ON public.therapist_professions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ));

-- 5) Treatment modalities
CREATE TABLE IF NOT EXISTS public.treatment_modalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_he text NOT NULL,
  name_en text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.treatment_modalities TO anon, authenticated;
GRANT ALL ON public.treatment_modalities TO service_role;
ALTER TABLE public.treatment_modalities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read treatment_modalities" ON public.treatment_modalities
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.therapist_modalities (
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  modality_id uuid NOT NULL REFERENCES public.treatment_modalities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (therapist_id, modality_id)
);
CREATE INDEX IF NOT EXISTS therapist_modalities_modality_idx
  ON public.therapist_modalities(modality_id);
GRANT SELECT ON public.therapist_modalities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.therapist_modalities TO authenticated;
GRANT ALL ON public.therapist_modalities TO service_role;
ALTER TABLE public.therapist_modalities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_modalities" ON public.therapist_modalities
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owner manage therapist_modalities" ON public.therapist_modalities
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ));

-- 6) Locations
DO $$ BEGIN
  CREATE TYPE public.location_type AS ENUM ('clinic','home_visit','online','hospital','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.therapist_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  location_type public.location_type NOT NULL DEFAULT 'clinic',
  label text,
  address text,
  city text,
  region text,
  country text NOT NULL DEFAULT 'Israel',
  postal_code text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS therapist_locations_therapist_idx
  ON public.therapist_locations(therapist_id);
CREATE INDEX IF NOT EXISTS therapist_locations_city_idx
  ON public.therapist_locations(city);
CREATE INDEX IF NOT EXISTS therapist_locations_type_idx
  ON public.therapist_locations(location_type);
-- lat/lng btree — PostGIS gist index can be added in a later phase.
CREATE INDEX IF NOT EXISTS therapist_locations_latlng_idx
  ON public.therapist_locations(latitude, longitude);

GRANT SELECT ON public.therapist_locations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.therapist_locations TO authenticated;
GRANT ALL ON public.therapist_locations TO service_role;

ALTER TABLE public.therapist_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_locations" ON public.therapist_locations
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Owner manage therapist_locations" ON public.therapist_locations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.therapists t
    JOIN public.therapist_accounts a ON a.id = t.owner_account_id
    WHERE t.id = therapist_id AND a.auth_user_id = auth.uid()
  ));

CREATE TRIGGER trg_therapist_locations_updated_at
  BEFORE UPDATE ON public.therapist_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) Backfill: seed a primary location for each existing therapist from
-- their current city/lat/lng, so search continues working after later phases
-- migrate location filtering to therapist_locations. Existing `therapists.city`
-- column is preserved untouched — the current search engine keeps using it.
INSERT INTO public.therapist_locations
  (therapist_id, location_type, city, region, country, latitude, longitude, is_primary)
SELECT t.id, 'clinic', t.city, t.region, t.country, t.latitude, t.longitude, true
FROM public.therapists t
WHERE NOT EXISTS (
  SELECT 1 FROM public.therapist_locations l WHERE l.therapist_id = t.id
);

-- 8) Owner-scoped write access for existing therapist row (owners can update
-- their own profile). Public SELECT policy already exists.
CREATE POLICY "Owner can update own therapist row"
  ON public.therapists FOR UPDATE TO authenticated
  USING (
    owner_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = owner_account_id AND a.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.therapist_accounts a
      WHERE a.id = owner_account_id AND a.auth_user_id = auth.uid()
    )
  );

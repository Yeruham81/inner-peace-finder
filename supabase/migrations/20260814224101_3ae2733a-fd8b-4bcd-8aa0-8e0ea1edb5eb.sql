BEGIN;

-- ============================================================
-- 1) therapists: remove direct authenticated write access
-- ============================================================
DROP POLICY IF EXISTS "Owner can insert own therapist row" ON public.therapists;
DROP POLICY IF EXISTS "Owner can update own therapist row" ON public.therapists;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.therapists FROM authenticated;
GRANT SELECT ON TABLE public.therapists TO authenticated;
GRANT ALL ON TABLE public.therapists TO service_role;

-- ============================================================
-- 2) therapist_accounts: account_status / onboarding are platform-owned
-- ============================================================
DROP POLICY IF EXISTS "Account owner can update self" ON public.therapist_accounts;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.therapist_accounts FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.therapist_accounts TO authenticated;
GRANT ALL ON TABLE public.therapist_accounts TO service_role;

-- ============================================================
-- 3) editor relation tables: owner-scoped SELECT only
-- ============================================================
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('therapist_professions','Owner manage therapist_professions'),
    ('therapist_modalities','Owner manage therapist_modalities'),
    ('therapist_languages','Owner manage therapist_languages'),
    ('therapist_populations','Owner manage therapist_populations'),
    ('therapist_therapy_formats','Owner manages therapist therapy formats'),
    ('therapist_professional_memberships','Owner manages therapist_professional_memberships'),
    ('therapist_service_arrangements','Owner manages therapist_service_arrangements'),
    ('therapist_locations','Owner manage therapist_locations')
  ) AS v(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Owner reads own ' || r.tbl, r.tbl);
    EXECUTE format($f$
      CREATE POLICY %2$I ON public.%1$I
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.therapists t
          JOIN public.therapist_accounts a ON a.id = t.owner_account_id
          WHERE t.id = %1$I.therapist_id AND a.auth_user_id = auth.uid()
        ))
    $f$, r.tbl, 'Owner reads own ' || r.tbl);
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',
      r.tbl);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', r.tbl);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.tbl);
  END LOOP;
END $do$;

-- ============================================================
-- 4) Transactional profile save / publish
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_therapist_profile(_actor uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_profile   jsonb := _payload -> 'profile';
  v_status    text  := v_profile ->> 'profile_status';
  v_publish   boolean := coalesce((v_profile ->> 'publish')::boolean, false);
  v_semantic  jsonb := coalesce(_payload -> 'semantic_profile', '[]'::jsonb);
  v_account_id uuid;
  v_therapist_id uuid;
  v_created boolean := false;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'actor is required' USING ERRCODE = '42501';
  END IF;
  IF v_profile IS NULL OR jsonb_typeof(v_profile) <> 'object' THEN
    RAISE EXCEPTION 'profile payload is required';
  END IF;
  IF v_status IS NULL OR v_status NOT IN ('draft', 'completed', 'published') THEN
    RAISE EXCEPTION 'invalid profile_status';
  END IF;
  IF v_publish AND v_status <> 'published' THEN
    RAISE EXCEPTION 'publish requires profile_status = published';
  END IF;
  IF jsonb_typeof(v_semantic) <> 'array' THEN
    RAISE EXCEPTION 'semantic_profile must be an array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_semantic) AS e
    WHERE jsonb_typeof(e.value) <> 'object'
       OR coalesce(e.value ->> 'slug', '') = ''
       OR (e.value ->> 'weight') IS NULL
  ) THEN
    RAISE EXCEPTION 'semantic_profile entries must be { slug, weight }';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(_payload -> 'locations', '[]'::jsonb)) AS e
    WHERE coalesce(e.value ->> 'location_type', '') NOT IN ('clinic', 'online', 'home_visit')
  ) THEN
    RAISE EXCEPTION 'invalid location_type in payload';
  END IF;

  -- Ownership: resolved from the validated actor id only, never from payload.
  SELECT id INTO v_account_id
    FROM public.therapist_accounts
    WHERE auth_user_id = _actor
    FOR UPDATE;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'therapist account not found for actor' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_therapist_id
    FROM public.therapists
    WHERE owner_account_id = v_account_id
    FOR UPDATE;

  IF v_therapist_id IS NULL THEN
    INSERT INTO public.therapists (
      slug, full_name, gender, professional_title, full_description, short_intro,
      education_training, professional_experience, years_experience, email, phone, image_url,
      lgbtq_affirming, offers_free_intro, free_intro_types, free_intro_duration_minutes,
      city, region, country, profile_status, is_active, visibility,
      semantic_profile, owner_account_id, profile_claimed
    ) VALUES (
      coalesce(nullif(v_profile ->> 'slug', ''),
               'therapist-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      v_profile ->> 'full_name',
      nullif(v_profile ->> 'gender', '')::public.therapist_gender,
      nullif(v_profile ->> 'professional_title', ''),
      nullif(v_profile ->> 'full_description', ''),
      nullif(v_profile ->> 'short_intro', ''),
      nullif(v_profile ->> 'education_training', ''),
      nullif(v_profile ->> 'professional_experience', ''),
      coalesce((v_profile ->> 'years_experience')::integer, 0),
      nullif(v_profile ->> 'email', ''),
      nullif(v_profile ->> 'phone', ''),
      nullif(v_profile ->> 'image_url', ''),
      coalesce((v_profile ->> 'lgbtq_affirming')::boolean, false),
      coalesce((v_profile ->> 'offers_free_intro')::boolean, false),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(v_profile -> 'free_intro_types')), '{}')::text[],
      nullif(v_profile ->> 'free_intro_duration_minutes', '')::integer,
      nullif(v_profile ->> 'city', ''),
      nullif(v_profile ->> 'region', ''),
      'Israel',
      v_status::public.therapist_profile_status,
      true,
      (CASE WHEN v_publish THEN 'visible' ELSE 'hidden' END)::public.therapist_visibility,
      v_semantic,
      v_account_id,
      true
    )
    RETURNING id INTO v_therapist_id;
    v_created := true;

    UPDATE public.therapist_accounts
      SET account_status = 'claimed', onboarding_completed = true
      WHERE id = v_account_id;
  ELSE
    UPDATE public.therapists SET
      full_name = v_profile ->> 'full_name',
      gender = nullif(v_profile ->> 'gender', '')::public.therapist_gender,
      professional_title = nullif(v_profile ->> 'professional_title', ''),
      full_description = nullif(v_profile ->> 'full_description', ''),
      short_intro = nullif(v_profile ->> 'short_intro', ''),
      education_training = nullif(v_profile ->> 'education_training', ''),
      professional_experience = nullif(v_profile ->> 'professional_experience', ''),
      years_experience = coalesce((v_profile ->> 'years_experience')::integer, 0),
      email = nullif(v_profile ->> 'email', ''),
      phone = nullif(v_profile ->> 'phone', ''),
      image_url = nullif(v_profile ->> 'image_url', ''),
      lgbtq_affirming = coalesce((v_profile ->> 'lgbtq_affirming')::boolean, false),
      offers_free_intro = coalesce((v_profile ->> 'offers_free_intro')::boolean, false),
      free_intro_types =
        coalesce(ARRAY(SELECT jsonb_array_elements_text(v_profile -> 'free_intro_types')), '{}')::text[],
      free_intro_duration_minutes = nullif(v_profile ->> 'free_intro_duration_minutes', '')::integer,
      city = nullif(v_profile ->> 'city', ''),
      region = nullif(v_profile ->> 'region', ''),
      profile_status = v_status::public.therapist_profile_status,
      is_active = true,
      semantic_profile = v_semantic,
      -- Draft saves never change visibility; publishing is the only promotion.
      visibility = CASE WHEN v_publish
                        THEN 'visible'::public.therapist_visibility
                        ELSE public.therapists.visibility END
      WHERE public.therapists.id = v_therapist_id;
  END IF;

  DELETE FROM public.therapist_professions WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_professions (therapist_id, profession_id)
    SELECT v_therapist_id, e.value::uuid
      FROM jsonb_array_elements_text(coalesce(_payload -> 'profession_ids', '[]'::jsonb)) AS e(value);

  DELETE FROM public.therapist_modalities WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_modalities (therapist_id, modality_id)
    SELECT v_therapist_id, e.value::uuid
      FROM jsonb_array_elements_text(coalesce(_payload -> 'modality_ids', '[]'::jsonb)) AS e(value);

  DELETE FROM public.therapist_languages WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_languages (therapist_id, language_id)
    SELECT v_therapist_id, e.value::uuid
      FROM jsonb_array_elements_text(coalesce(_payload -> 'language_ids', '[]'::jsonb)) AS e(value);

  DELETE FROM public.therapist_populations WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_populations (therapist_id, population_id)
    SELECT v_therapist_id, e.value::uuid
      FROM jsonb_array_elements_text(coalesce(_payload -> 'population_ids', '[]'::jsonb)) AS e(value);

  DELETE FROM public.therapist_therapy_formats WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_therapy_formats (therapist_id, therapy_format_id)
    SELECT v_therapist_id, e.value::uuid
      FROM jsonb_array_elements_text(coalesce(_payload -> 'therapy_format_ids', '[]'::jsonb)) AS e(value);

  DELETE FROM public.therapist_professional_memberships WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_professional_memberships
      (therapist_id, organization_name, member_since, membership_start_date, sort_order)
    SELECT v_therapist_id,
           e.value ->> 'organization_name',
           nullif(e.value ->> 'member_since', '')::integer,
           nullif(e.value ->> 'membership_start_date', '')::date,
           (e.ordinality - 1)::integer
      FROM jsonb_array_elements(coalesce(_payload -> 'professional_memberships', '[]'::jsonb))
        WITH ORDINALITY AS e(value, ordinality);

  DELETE FROM public.therapist_service_arrangements WHERE therapist_id = v_therapist_id;
  INSERT INTO public.therapist_service_arrangements
      (therapist_id, organization_name, note, sort_order)
    SELECT v_therapist_id,
           e.value ->> 'organization_name',
           nullif(e.value ->> 'note', ''),
           (e.ordinality - 1)::integer
      FROM jsonb_array_elements(coalesce(_payload -> 'service_arrangements', '[]'::jsonb))
        WITH ORDINALITY AS e(value, ordinality);

  -- Only editor-managed location types are replaced; anything else is preserved.
  DELETE FROM public.therapist_locations
    WHERE therapist_id = v_therapist_id
      AND location_type IN ('clinic', 'online', 'home_visit');
  INSERT INTO public.therapist_locations
      (therapist_id, location_type, city, region, address, country, is_primary, is_active,
       accessibility_status, accessibility_features, accessibility_note)
    SELECT v_therapist_id,
           (e.value ->> 'location_type')::public.location_type,
           nullif(e.value ->> 'city', ''),
           nullif(e.value ->> 'region', ''),
           nullif(e.value ->> 'address', ''),
           'Israel',
           coalesce((e.value ->> 'is_primary')::boolean, false),
           true,
           coalesce(nullif(e.value ->> 'accessibility_status', ''), 'unknown'),
           coalesce(ARRAY(SELECT jsonb_array_elements_text(e.value -> 'accessibility_features')), '{}')::text[],
           nullif(e.value ->> 'accessibility_note', '')
      FROM jsonb_array_elements(coalesce(_payload -> 'locations', '[]'::jsonb)) AS e(value);

  RETURN jsonb_build_object(
    'therapist_id', v_therapist_id,
    'profile_status', v_status,
    'created', v_created
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_therapist_profile(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_therapist_profile(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_therapist_profile(uuid, jsonb) TO service_role;

-- ============================================================
-- 5) Permanent deletion: hide first, finalize later (both retryable)
-- ============================================================
CREATE OR REPLACE FUNCTION public.begin_therapist_profile_deletion(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_account_id uuid;
  v_auth_user_id uuid;
  v_therapist_id uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'actor is required' USING ERRCODE = '42501';
  END IF;

  SELECT id, auth_user_id INTO v_account_id, v_auth_user_id
    FROM public.therapist_accounts
    WHERE auth_user_id = _actor
    FOR UPDATE;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'therapist account not found for actor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.therapists
    SET visibility = 'hidden'::public.therapist_visibility,
        is_active = false
    WHERE owner_account_id = v_account_id
    RETURNING id INTO v_therapist_id;

  RETURN jsonb_build_object(
    'therapist_id', v_therapist_id,
    'auth_user_id', v_auth_user_id,
    'found', v_therapist_id IS NOT NULL
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.begin_therapist_profile_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_therapist_profile_deletion(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_therapist_profile_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_therapist_profile_deletion(_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_account_id uuid;
  v_deleted integer := 0;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'actor is required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_account_id
    FROM public.therapist_accounts
    WHERE auth_user_id = _actor
    FOR UPDATE;
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'therapist account not found for actor' USING ERRCODE = '42501';
  END IF;

  WITH removed AS (
    DELETE FROM public.therapists WHERE owner_account_id = v_account_id RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM removed;

  UPDATE public.therapist_accounts
    SET account_status = 'active', onboarding_completed = false
    WHERE id = v_account_id;

  RETURN jsonb_build_object('deleted', v_deleted > 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_therapist_profile_deletion(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_therapist_profile_deletion(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_therapist_profile_deletion(uuid) TO service_role;

COMMIT;
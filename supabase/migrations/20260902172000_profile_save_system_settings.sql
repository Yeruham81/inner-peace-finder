-- Enforce the admin System Settings at the transactional profile-save boundary.
-- This mirrors the application checks so alternate server paths cannot bypass
-- publication requirements. Registration availability is intentionally not
-- enforced here: it only controls creation of new therapist accounts.

begin;

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
  v_years_raw text;
  v_years     integer;
  v_intro_raw text;
  v_intro     integer;
  v_account_id uuid;
  v_therapist_id uuid;
  v_created boolean := false;
  v_save_mode text := coalesce(nullif(_payload ->> 'save_mode', ''), 'self');
  v_target_therapist_id uuid := nullif(_payload ->> 'target_therapist_id', '')::uuid;
  v_is_admin boolean := false;
  v_existing_status public.therapist_profile_status;
  v_require_payment boolean := true;
  v_require_verified_credential boolean := false;
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

  -- Numeric fields: an absent/empty value stays NULL; malformed text is a
  -- controlled validation error instead of an uncontrolled cast failure.
  v_years_raw := nullif(pg_catalog.btrim(coalesce(v_profile ->> 'years_experience', '')), '');
  IF v_years_raw IS NOT NULL THEN
    IF v_years_raw !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'invalid years_experience';
    END IF;
    v_years := v_years_raw::integer;
    IF v_years > 100 THEN RAISE EXCEPTION 'invalid years_experience'; END IF;
  END IF;

  v_intro_raw := nullif(pg_catalog.btrim(coalesce(v_profile ->> 'free_intro_duration_minutes', '')), '');
  IF v_intro_raw IS NOT NULL THEN
    IF v_intro_raw !~ '^[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'invalid free_intro_duration_minutes';
    END IF;
    v_intro := v_intro_raw::integer;
  END IF;

  -- The browser never decides ownership. Self-service saves resolve the owner
  -- from the authenticated actor. Admin-public saves are allowed only for an
  -- auth user whose immutable app metadata carries tipulinks_role=admin.
  IF v_save_mode = 'self' THEN
    IF v_target_therapist_id IS NOT NULL THEN
      RAISE EXCEPTION 'self save cannot target another therapist' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_account_id
      FROM public.therapist_accounts
      WHERE auth_user_id = _actor
      FOR UPDATE;
    IF v_account_id IS NULL THEN
      RAISE EXCEPTION 'therapist account not found for actor' USING ERRCODE = '42501';
    END IF;

    SELECT id, profile_status INTO v_therapist_id, v_existing_status
      FROM public.therapists
      WHERE owner_account_id = v_account_id
      FOR UPDATE;
  ELSIF v_save_mode = 'admin_public_info' THEN
    SELECT coalesce((u.raw_app_meta_data ->> 'tipulinks_role') = 'admin', false)
      INTO v_is_admin
      FROM auth.users AS u
      WHERE u.id = _actor;
    IF NOT coalesce(v_is_admin, false) THEN
      RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
    END IF;

    IF v_target_therapist_id IS NOT NULL THEN
      SELECT id INTO v_therapist_id
        FROM public.therapists
        WHERE id = v_target_therapist_id
          AND profile_origin = 'admin_public_info'
          AND owner_account_id IS NULL
          AND do_not_republish = false
        FOR UPDATE;
      IF v_therapist_id IS NULL THEN
        RAISE EXCEPTION 'admin-managed profile is owned, suppressed or missing' USING ERRCODE = '42501';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid save_mode';
  END IF;

  -- Publication rules apply to every existing therapist account regardless of
  -- whether new public registrations are currently open.
  IF v_save_mode = 'self' AND v_publish AND coalesce(v_existing_status::text, '') <> 'published' THEN
    SELECT
      coalesce(require_payment_method_for_publish, true),
      coalesce(require_verified_credential_for_publish, false)
    INTO v_require_payment, v_require_verified_credential
    FROM public.system_settings
    WHERE singleton = true;

    IF coalesce(v_require_payment, true) AND NOT EXISTS (
      SELECT 1
      FROM public.therapist_accounts AS account
      WHERE account.id = v_account_id
        AND account.payment_method_status = 'active'
    ) THEN
      RAISE EXCEPTION 'payment_method_required';
    END IF;

    IF coalesce(v_require_verified_credential, false) AND (
      v_therapist_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.therapist_credentials AS credential
        WHERE credential.therapist_id = v_therapist_id
          AND credential.verification_status = 'verified'
      )
    ) THEN
      RAISE EXCEPTION 'verified_credential_required';
    END IF;
  END IF;

  IF v_therapist_id IS NULL THEN
    INSERT INTO public.therapists (
      slug, full_name, gender, professional_title, full_description, short_intro,
      education_training, professional_experience, years_experience, email, phone, image_url,
      lgbtq_affirming, offers_free_intro, free_intro_types, free_intro_duration_minutes,
      city, region, country, profile_status, is_active, visibility,
      semantic_profile, owner_account_id, profile_claimed, profile_origin
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
      v_years,
      nullif(v_profile ->> 'email', ''),
      nullif(v_profile ->> 'phone', ''),
      nullif(v_profile ->> 'image_url', ''),
      coalesce((v_profile ->> 'lgbtq_affirming')::boolean, false),
      coalesce((v_profile ->> 'offers_free_intro')::boolean, false),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(v_profile -> 'free_intro_types')), '{}')::text[],
      v_intro,
      nullif(v_profile ->> 'city', ''),
      nullif(v_profile ->> 'region', ''),
      'Israel',
      v_status::public.therapist_profile_status,
      true,
      (CASE WHEN v_publish THEN 'visible' ELSE 'hidden' END)::public.therapist_visibility,
      v_semantic,
      CASE WHEN v_save_mode = 'self' THEN v_account_id ELSE NULL END,
      v_save_mode = 'self',
      CASE WHEN v_save_mode = 'self' THEN 'self_created' ELSE 'admin_public_info' END
    )
    RETURNING id INTO v_therapist_id;
    v_created := true;

    IF v_save_mode = 'self' THEN
      UPDATE public.therapist_accounts
        SET account_status = 'claimed', onboarding_completed = true
        WHERE id = v_account_id;
    END IF;
  ELSE
    UPDATE public.therapists SET
      full_name = v_profile ->> 'full_name',
      gender = nullif(v_profile ->> 'gender', '')::public.therapist_gender,
      professional_title = nullif(v_profile ->> 'professional_title', ''),
      full_description = nullif(v_profile ->> 'full_description', ''),
      short_intro = nullif(v_profile ->> 'short_intro', ''),
      education_training = nullif(v_profile ->> 'education_training', ''),
      professional_experience = nullif(v_profile ->> 'professional_experience', ''),
      years_experience = v_years,
      email = nullif(v_profile ->> 'email', ''),
      phone = nullif(v_profile ->> 'phone', ''),
      image_url = nullif(v_profile ->> 'image_url', ''),
      lgbtq_affirming = coalesce((v_profile ->> 'lgbtq_affirming')::boolean, false),
      offers_free_intro = coalesce((v_profile ->> 'offers_free_intro')::boolean, false),
      free_intro_types =
        coalesce(ARRAY(SELECT jsonb_array_elements_text(v_profile -> 'free_intro_types')), '{}')::text[],
      free_intro_duration_minutes = v_intro,
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

-- Keep contact preferences and the "owner reviewed" transition in the same
-- database transaction as the existing profile + relation save. This removes
-- the need for any direct therapists-table mutation from application code.
CREATE OR REPLACE FUNCTION public.save_therapist_profile_with_contacts(
  _actor uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  saved jsonb;
  therapist_id uuid;
  methods_json jsonb;
  methods text[];
  preferred text;
  max_methods integer := 3;
  require_contact boolean := true;
  publish_requested boolean := coalesce((_payload #>> '{profile,publish}')::boolean, false);
BEGIN
  SELECT public.save_therapist_profile(_actor, _payload)
  INTO saved;

  therapist_id := NULLIF(saved->>'therapist_id', '')::uuid;
  IF therapist_id IS NULL THEN
    RAISE EXCEPTION 'save_therapist_profile returned no therapist_id';
  END IF;

  methods_json := COALESCE(_payload #> '{profile,contact_methods}', '[]'::jsonb);
  IF pg_catalog.jsonb_typeof(methods_json) <> 'array' THEN
    RAISE EXCEPTION 'contact_methods must be an array';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(method ORDER BY first_ordinality), ARRAY[]::text[])
  INTO methods
  FROM (
    SELECT value AS method, min(ord) AS first_ordinality
    FROM pg_catalog.jsonb_array_elements_text(methods_json) WITH ORDINALITY AS item(value, ord)
    GROUP BY value
  ) AS unique_methods;

  SELECT
    greatest(1, least(3, coalesce(max_contact_methods, 3))),
    coalesce(require_contact_method_for_publish, true)
  INTO max_methods, require_contact
  FROM public.system_settings
  WHERE singleton = true;

  IF pg_catalog.cardinality(methods) > coalesce(max_methods, 3) THEN
    RAISE EXCEPTION 'contact_methods_exceed_system_limit';
  END IF;

  IF publish_requested AND coalesce(require_contact, true) AND pg_catalog.cardinality(methods) = 0 THEN
    RAISE EXCEPTION 'contact_method_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(methods) AS method
    WHERE method NOT IN ('whatsapp', 'email', 'phone')
  ) THEN
    RAISE EXCEPTION 'unsupported contact method';
  END IF;

  preferred := NULLIF(_payload #>> '{profile,preferred_contact_method}', '');

  IF pg_catalog.cardinality(methods) = 0 THEN
    IF preferred IS NOT NULL THEN
      RAISE EXCEPTION 'preferred_contact_method requires an active contact method';
    END IF;
  ELSE
    IF preferred IS NULL THEN
      preferred := methods[1];
    END IF;
    IF NOT (preferred = ANY(methods)) THEN
      RAISE EXCEPTION 'preferred_contact_method must be included in contact_methods';
    END IF;
  END IF;

  UPDATE public.therapists
  SET
    contact_methods = methods,
    preferred_contact_method = preferred,
    owner_reviewed_at = CASE
      WHEN profile_origin = 'admin_public_info' AND owner_account_id IS NOT NULL AND owner_reviewed_at IS NULL
        THEN pg_catalog.now()
      ELSE owner_reviewed_at
    END
  WHERE id = therapist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved therapist was not found';
  END IF;

  RETURN saved;
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) TO service_role;

commit;

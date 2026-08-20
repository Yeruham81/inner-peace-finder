
-- Claim v2 integration hardening. This migration intentionally re-asserts the
-- effective security invariants of the profile-save and lead-submit paths
-- while adding the unclaimed-profile contact gate.

ALTER TABLE public.therapists ALTER COLUMN years_experience DROP DEFAULT;
ALTER TABLE public.therapists ALTER COLUMN years_experience DROP NOT NULL;

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

  IF pg_catalog.cardinality(methods) > 3 THEN
    RAISE EXCEPTION 'contact_methods may contain at most three methods';
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
      WHEN profile_origin = 'admin_public_info' AND owner_reviewed_at IS NULL
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


CREATE OR REPLACE FUNCTION public.submit_lead(
  _challenge_id uuid,
  _answer integer,
  _ip_hash text,
  _session_hash text,
  _session_id text,
  _therapist_id uuid,
  _cta_id text,
  _source_problem_id uuid,
  _population_id uuid,
  _visitor_name text,
  _visitor_phone text,
  _message text,
  _user_agent text
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  lead_id uuid,
  cta_event_id uuid,
  billable boolean,
  therapist_name text,
  delivery_channel text,
  destination text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  ip_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(mins => 15);
  therapist_window timestamptz := pg_catalog.now() - pg_catalog.make_interval(hours => 1);
  attempt_count integer;
  distinct_therapists integer;
  session_therapists integer;
  accepted_same integer;
  challenge public.lead_challenges;
  v_therapist public.therapists;
  v_cta_id uuid;
  v_billable boolean := false;
  v_lead_id uuid;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash = '' OR _session_hash IS NULL OR _session_hash = '' THEN
    RAISE EXCEPTION 'identity hashes are required';
  END IF;

  -- Serialize per IP hash and per session hash so counting, challenge
  -- consumption and the inserts below cannot be interleaved by parallel
  -- requests sharing either identity.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lead_submit_ip:' || _ip_hash));
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lead_submit_session:' || _session_hash));

  SELECT pg_catalog.count(*) INTO attempt_count
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash AND a.created_at >= ip_window;
  IF attempt_count >= 10 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO distinct_therapists
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.created_at >= ip_window
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF distinct_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(DISTINCT a.therapist_id) INTO session_therapists
    FROM public.lead_submission_attempts a
    WHERE a.session_hash = _session_hash
      AND a.created_at >= ip_window
      AND a.outcome = 'accepted'
      AND a.therapist_id IS NOT NULL
      AND a.therapist_id <> _therapist_id;
  IF session_therapists >= 5 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO accepted_same
    FROM public.lead_submission_attempts a
    WHERE a.ip_hash = _ip_hash
      AND a.therapist_id = _therapist_id
      AND a.outcome = 'accepted'
      AND a.created_at >= therapist_window;
  IF accepted_same >= 3 THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'rate_limit_exceeded');
    RETURN QUERY SELECT false, 'rate_limit_exceeded', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Challenge: single use, IP bound, expiring.
  SELECT * INTO challenge FROM public.lead_challenges c
    WHERE c.id = _challenge_id
    FOR UPDATE;

  IF NOT FOUND
     OR challenge.ip_hash IS DISTINCT FROM _ip_hash
     OR challenge.expected_answer IS DISTINCT FROM _answer THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_failed');
    RETURN QUERY SELECT false, 'challenge_failed', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= pg_catalog.now() THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'challenge_expired');
    RETURN QUERY SELECT false, 'challenge_expired', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Canonical public eligibility, re-checked at submission time. Lock the
  -- therapist row as well so the one-time unclaimed-profile contact gate is
  -- race-safe across concurrent visitors.
  SELECT * INTO v_therapist
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Profiles created by Tipulinks from public information may trigger only
  -- one initial contact across the whole platform until the therapist claims
  -- the profile. This is global per therapist, not per visitor/session.
  IF v_therapist.profile_origin = 'admin_public_info'
     AND v_therapist.owner_account_id IS NULL
     AND (v_therapist.first_contact_reserved_at IS NOT NULL OR v_therapist.first_contact_sent_at IS NOT NULL) THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'unclaimed_contact_limit');
    RETURN QUERY SELECT false, 'unclaimed_contact_limit', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- From here on everything commits or rolls back together.
  UPDATE public.lead_challenges
    SET consumed_at = pg_catalog.now()
    WHERE id = challenge.id;

  IF v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL THEN
    UPDATE public.therapists
      SET first_contact_reserved_at = pg_catalog.now()
      WHERE id = _therapist_id;
  END IF;

  INSERT INTO public.cta_clicks
      (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
    VALUES
      (_therapist_id, _session_id, coalesce(_cta_id, 'primary'), _source_problem_id,
       _ip_hash, _user_agent, NOT (v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL))
    ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
    RETURNING id INTO v_cta_id;

  IF v_cta_id IS NOT NULL THEN
    v_billable := NOT (v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL);
  ELSE
    SELECT c.id INTO v_cta_id
      FROM public.cta_clicks c
      WHERE c.session_id = _session_id
        AND c.therapist_id = _therapist_id
        AND c.cta_id = coalesce(_cta_id, 'primary')
      LIMIT 1;
  END IF;

  INSERT INTO public.lead_events (
    cta_event_id, session_id, therapist_id, problem_id, population_id,
    visitor_name, visitor_phone, message, challenge_presented, challenge_passed,
    delivery_channel, delivery_status
  ) VALUES (
    v_cta_id, _session_id, _therapist_id, _source_problem_id, _population_id,
    _visitor_name, _visitor_phone, _message, NULL, true,
    CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
         THEN 'email' ELSE coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp') END,
    CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
         THEN 'awaiting_consent' ELSE 'pending' END
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    VALUES (_ip_hash, _session_hash, _therapist_id, 'accepted');

  RETURN QUERY SELECT true, 'accepted',
                      v_lead_id, v_cta_id, v_billable,
                      v_therapist.full_name,
                      CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
                           THEN 'consent_hold' ELSE coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp') END,
                      CASE WHEN v_therapist.profile_origin = 'admin_public_info' AND v_therapist.owner_account_id IS NULL
                           THEN NULL::text
                           ELSE coalesce(nullif(v_therapist.contact_destination, ''), v_therapist.phone) END;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) TO service_role;

-- The split authorization path remains superseded by submit_lead.
DROP FUNCTION IF EXISTS public.authorize_lead_submission(uuid, integer, text, text, uuid);

-- Re-assert the restricted purge grant in the latest effective hardening
-- migration so no later lead change accidentally weakens it.
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role;

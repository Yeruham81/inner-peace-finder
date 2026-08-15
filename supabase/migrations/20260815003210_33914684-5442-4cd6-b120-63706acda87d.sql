-- Phase 3 security hardening (additive):
--  1. years_experience may be NULL again (empty draft value must not become 0).
--  2. One transactional, service-role-only RPC for an accepted lead submission.
--  3. Remove search_path = 'public' from privileged SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------
-- 1. years_experience: restore NULL semantics
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Atomic accepted-lead submission
-- ---------------------------------------------------------------------------
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

  -- Canonical public eligibility, re-checked at submission time.
  SELECT * INTO v_therapist
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published');
  IF NOT FOUND THEN
    INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
      VALUES (_ip_hash, _session_hash, _therapist_id, 'therapist_unavailable');
    RETURN QUERY SELECT false, 'therapist_unavailable', NULL::uuid, NULL::uuid, false,
                        NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- From here on everything commits or rolls back together.
  UPDATE public.lead_challenges
    SET consumed_at = pg_catalog.now()
    WHERE id = challenge.id;

  INSERT INTO public.cta_clicks
      (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
    VALUES
      (_therapist_id, _session_id, coalesce(_cta_id, 'primary'), _source_problem_id,
       _ip_hash, _user_agent, true)
    ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
    RETURNING id INTO v_cta_id;

  IF v_cta_id IS NOT NULL THEN
    v_billable := true;
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
    coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp'), 'pending'
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.lead_submission_attempts (ip_hash, session_hash, therapist_id, outcome)
    VALUES (_ip_hash, _session_hash, _therapist_id, 'accepted');

  RETURN QUERY SELECT true, 'accepted', v_lead_id, v_cta_id, v_billable,
                      v_therapist.full_name,
                      coalesce(v_therapist.preferred_contact_channel::text, 'whatsapp'),
                      coalesce(nullif(v_therapist.contact_destination, ''), v_therapist.phone);
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead(uuid, integer, text, text, text, uuid, text, uuid, uuid, text, text, text, text) TO service_role;

-- Superseded by public.submit_lead: split authorization is no longer callable.
DROP FUNCTION IF EXISTS public.authorize_lead_submission(uuid, integer, text, text, uuid);

-- ---------------------------------------------------------------------------
-- 3. Remove search_path = 'public' from privileged functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_cta_click(
  _therapist_id uuid,
  _session_id text,
  _cta_id text DEFAULT 'primary',
  _source_problem_id uuid DEFAULT NULL,
  _ip_hash text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS TABLE(billable boolean, already_exists boolean, click_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  inserted_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.therapists t
    WHERE t.id = _therapist_id
      AND t.is_active = true
      AND t.profile_status = 'published'
      AND t.visibility IN ('visible', 'published')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.cta_clicks
    (therapist_id, session_id, cta_id, source_problem_id, ip_hash, user_agent, billable)
  VALUES
    (_therapist_id, _session_id, _cta_id, _source_problem_id, _ip_hash, _user_agent, true)
  ON CONFLICT (session_id, therapist_id, cta_id) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT true, false, inserted_id;
  ELSE
    RETURN QUERY
      SELECT false, true, c.id
      FROM public.cta_clicks c
      WHERE c.session_id = _session_id
        AND c.therapist_id = _therapist_id
        AND c.cta_id = _cta_id
      LIMIT 1;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cta_click(uuid, text, text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_lead_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE deleted integer;
BEGIN
  DELETE FROM public.lead_challenges
    WHERE created_at < pg_catalog.now() - pg_catalog.make_interval(hours => 24);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_lead_challenges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_lead_challenges() TO service_role;

CREATE OR REPLACE FUNCTION public.approve_therapist_claim(_claim_id uuid, _reviewer uuid)
RETURNS public.therapist_claim_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  claim public.therapist_claim_requests;
BEGIN
  SELECT * INTO claim FROM public.therapist_claim_requests
    WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  IF claim.status NOT IN ('pending','needs_information') THEN
    RAISE EXCEPTION 'claim is not open (status=%)', claim.status;
  END IF;

  IF claim.request_type = 'claim_profile' THEN
    UPDATE public.therapists
      SET owner_account_id = claim.requester_account_id,
          profile_claimed = true
      WHERE id = claim.therapist_id AND owner_account_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'therapist already owned';
    END IF;
    UPDATE public.therapist_accounts
      SET account_status = 'claimed'
      WHERE id = claim.requester_account_id;
  ELSIF claim.request_type = 'remove_profile' THEN
    UPDATE public.therapists
      SET visibility = 'hidden_by_owner',
          is_active = false
      WHERE id = claim.therapist_id;
  END IF;

  UPDATE public.therapist_claim_requests
    SET status = 'approved', reviewed_by = _reviewer, reviewed_at = pg_catalog.now()
    WHERE id = _claim_id
    RETURNING * INTO claim;
  RETURN claim;
END $fn$;

REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_therapist_claim(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_therapist_claim(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_claim_request_status(
  _claim_id uuid, _reviewer uuid, _new_status public.claim_request_status
)
RETURNS public.therapist_claim_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE claim public.therapist_claim_requests;
BEGIN
  IF _new_status NOT IN ('rejected','needs_information','pending') THEN
    RAISE EXCEPTION 'unsupported status transition: %', _new_status;
  END IF;
  UPDATE public.therapist_claim_requests
    SET status = _new_status, reviewed_by = _reviewer, reviewed_at = pg_catalog.now()
    WHERE id = _claim_id
    RETURNING * INTO claim;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  RETURN claim;
END $fn$;

REVOKE ALL ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_claim_request_status(uuid, uuid, public.claim_request_status) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_claim_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  ev text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    ev := 'request_submitted';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    ev := CASE NEW.status::text
      WHEN 'approved' THEN 'request_approved'
      WHEN 'rejected' THEN 'request_rejected'
      WHEN 'needs_information' THEN 'request_needs_information'
      ELSE NULL
    END;
  END IF;
  IF ev IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (event_type, claim_request_id, recipient_account_id, payload)
  VALUES (
    ev,
    NEW.id,
    NEW.requester_account_id,
    jsonb_build_object(
      'request_type', NEW.request_type,
      'verification_method', NEW.verification_method,
      'therapist_id', NEW.therapist_id,
      'status', NEW.status
    )
  );
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.enqueue_claim_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_claim_notification() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END $fn$;
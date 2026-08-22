-- Admin management for Tipulinks-created, still-unclaimed therapist profiles.

-- Human-readable, stable therapist URLs. This runs only on INSERT, so profile
-- name edits never rewrite existing public URLs. The advisory transaction lock
-- prevents two simultaneous same-name inserts from choosing the same suffix.
CREATE OR REPLACE FUNCTION public.assign_unique_therapist_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
BEGIN
  v_base := pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.lower(coalesce(NEW.full_name, '')),
      '[^a-z0-9א-ת]+',
      '-',
      'g'
    ),
    '-'
  );
  v_base := pg_catalog.substr(v_base, 1, 60);
  IF v_base = '' THEN v_base := 'therapist'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_base)::bigint);
  v_candidate := v_base;
  WHILE EXISTS (SELECT 1 FROM public.therapists WHERE slug = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := v_base || '-' || v_suffix::text;
  END LOOP;

  NEW.slug := v_candidate;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_assign_unique_therapist_slug ON public.therapists;
CREATE TRIGGER trg_assign_unique_therapist_slug
  BEFORE INSERT ON public.therapists
  FOR EACH ROW EXECUTE FUNCTION public.assign_unique_therapist_slug();

-- Deletion is two-phase: begin hides + locks the profile against Claim, then
-- the server removes storage objects, then finalize deletes the DB row.

CREATE OR REPLACE FUNCTION public.begin_admin_public_profile_deletion(
  _actor uuid,
  _therapist_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_is_admin boolean := false;
  v_id uuid;
BEGIN
  SELECT coalesce((u.raw_app_meta_data ->> 'tipulinks_role') = 'admin', false)
    INTO v_is_admin
    FROM auth.users AS u
    WHERE u.id = _actor;
  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.therapists
  SET
    is_active = false,
    visibility = 'hidden'::public.therapist_visibility,
    do_not_republish = true
  WHERE id = _therapist_id
    AND profile_origin = 'admin_public_info'
    AND owner_account_id IS NULL
    AND profile_claimed = false
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'only an unclaimed Tipulinks-created profile can be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_admin_public_profile_deletion(
  _actor uuid,
  _therapist_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_is_admin boolean := false;
  v_id uuid;
BEGIN
  SELECT coalesce((u.raw_app_meta_data ->> 'tipulinks_role') = 'admin', false)
    INTO v_is_admin
    FROM auth.users AS u
    WHERE u.id = _actor;
  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.therapists
  WHERE id = _therapist_id
    AND profile_origin = 'admin_public_info'
    AND owner_account_id IS NULL
    AND profile_claimed = false
    AND do_not_republish = true
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'profile deletion was not reserved or ownership changed' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.begin_admin_public_profile_deletion(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_admin_public_profile_deletion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_admin_public_profile_deletion(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_admin_public_profile_deletion(uuid, uuid) TO service_role;

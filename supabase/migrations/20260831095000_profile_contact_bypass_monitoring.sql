-- Blocked attempts to place direct-contact details in public therapist profile
-- text are counted per therapist account. Raw attempted text is intentionally
-- not stored; only the field names and detection categories are retained.

ALTER TABLE public.therapist_accounts
  ADD COLUMN IF NOT EXISTS contact_policy_violation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_policy_last_violation_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_policy_last_violation_types text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.therapist_accounts
  DROP CONSTRAINT IF EXISTS therapist_accounts_contact_policy_violation_count_nonnegative;
ALTER TABLE public.therapist_accounts
  ADD CONSTRAINT therapist_accounts_contact_policy_violation_count_nonnegative
  CHECK (contact_policy_violation_count >= 0);

CREATE TABLE IF NOT EXISTS public.therapist_contact_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_account_id uuid NOT NULL REFERENCES public.therapist_accounts(id) ON DELETE CASCADE,
  therapist_id uuid REFERENCES public.therapists(id) ON DELETE SET NULL,
  violation_types text[] NOT NULL,
  field_names text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT therapist_contact_policy_events_types_nonempty CHECK (cardinality(violation_types) > 0),
  CONSTRAINT therapist_contact_policy_events_fields_nonempty CHECK (cardinality(field_names) > 0),
  CONSTRAINT therapist_contact_policy_events_types_allowed CHECK (
    violation_types <@ ARRAY['phone', 'email', 'website', 'social']::text[]
  )
);

CREATE INDEX IF NOT EXISTS therapist_contact_policy_events_account_created_idx
  ON public.therapist_contact_policy_events (therapist_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS therapist_contact_policy_events_therapist_created_idx
  ON public.therapist_contact_policy_events (therapist_id, created_at DESC)
  WHERE therapist_id IS NOT NULL;

ALTER TABLE public.therapist_contact_policy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.therapist_contact_policy_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.therapist_contact_policy_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_profile_contact_policy_violation(
  _actor uuid,
  _therapist_id uuid,
  _violation_types text[],
  _field_names text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_account_id uuid;
  v_count integer;
  v_created_at timestamptz := now();
  v_types text[];
  v_fields text[];
BEGIN
  IF coalesce(cardinality(_violation_types), 0) = 0 OR coalesce(cardinality(_field_names), 0) = 0 THEN
    RAISE EXCEPTION 'contact_policy_violation_requires_details';
  END IF;

  SELECT ARRAY(SELECT DISTINCT value ORDER BY value)
    INTO v_types
  FROM unnest(_violation_types) AS value;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_types) AS value
    WHERE value NOT IN ('phone', 'email', 'website', 'social')
  ) THEN
    RAISE EXCEPTION 'contact_policy_violation_type_invalid';
  END IF;

  SELECT ARRAY(SELECT DISTINCT value ORDER BY value)
    INTO v_fields
  FROM unnest(_field_names) AS value;

  SELECT account.id
    INTO v_account_id
  FROM public.therapist_accounts AS account
  WHERE account.auth_user_id = _actor
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'therapist_account_not_found';
  END IF;

  IF _therapist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.therapists AS therapist
    WHERE therapist.id = _therapist_id
      AND therapist.owner_account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'therapist_not_owned_by_actor';
  END IF;

  INSERT INTO public.therapist_contact_policy_events (
    therapist_account_id,
    therapist_id,
    violation_types,
    field_names,
    created_at
  ) VALUES (
    v_account_id,
    _therapist_id,
    v_types,
    v_fields,
    v_created_at
  );

  UPDATE public.therapist_accounts
  SET contact_policy_violation_count = contact_policy_violation_count + 1,
      contact_policy_last_violation_at = v_created_at,
      contact_policy_last_violation_types = v_types,
      updated_at = v_created_at
  WHERE id = v_account_id
  RETURNING contact_policy_violation_count INTO v_count;

  RETURN jsonb_build_object(
    'count', v_count,
    'last_violation_at', v_created_at,
    'types', to_jsonb(v_types)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_profile_contact_policy_violation(uuid, uuid, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_profile_contact_policy_violation(uuid, uuid, text[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_profile_contact_policy_violation(uuid, uuid, text[], text[]) TO service_role;

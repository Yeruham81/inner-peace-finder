BEGIN;

-- Contact availability is deliberately separate from the existing
-- public.contact_channel enum. That enum describes lead-delivery channels;
-- "phone" here describes a public contact action.
ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS contact_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS preferred_contact_method text;

-- Existing profiles receive one safe default based on the legacy preferred
-- delivery channel. SMS is intentionally retired from the editor; legacy SMS
-- profiles fall back to email rather than silently enabling WhatsApp.
UPDATE public.therapists
SET
  contact_methods = CASE preferred_contact_channel::text
    WHEN 'whatsapp' THEN ARRAY['whatsapp']::text[]
    WHEN 'email' THEN ARRAY['email']::text[]
    ELSE ARRAY['email']::text[]
  END,
  preferred_contact_method = CASE preferred_contact_channel::text
    WHEN 'whatsapp' THEN 'whatsapp'
    WHEN 'email' THEN 'email'
    ELSE 'email'
  END
WHERE cardinality(contact_methods) = 0;

ALTER TABLE public.therapists
  DROP CONSTRAINT IF EXISTS therapists_contact_methods_allowed,
  DROP CONSTRAINT IF EXISTS therapists_contact_methods_max_three,
  DROP CONSTRAINT IF EXISTS therapists_contact_methods_unique,
  DROP CONSTRAINT IF EXISTS therapists_preferred_contact_method_valid;

ALTER TABLE public.therapists
  ADD CONSTRAINT therapists_contact_methods_allowed
    CHECK (contact_methods <@ ARRAY['whatsapp', 'email', 'phone']::text[]),
  ADD CONSTRAINT therapists_contact_methods_max_three
    CHECK (cardinality(contact_methods) <= 3),
  ADD CONSTRAINT therapists_contact_methods_unique
    CHECK (
      cardinality(contact_methods) < 2
      OR (
        contact_methods[1] IS DISTINCT FROM contact_methods[2]
        AND (
          cardinality(contact_methods) < 3
          OR (
            contact_methods[1] IS DISTINCT FROM contact_methods[3]
            AND contact_methods[2] IS DISTINCT FROM contact_methods[3]
          )
        )
      )
    ),
  ADD CONSTRAINT therapists_preferred_contact_method_valid
    CHECK (
      (
        cardinality(contact_methods) = 0
        AND preferred_contact_method IS NULL
      )
      OR
      (
        cardinality(contact_methods) > 0
        AND preferred_contact_method = ANY(contact_methods)
      )
    );

COMMENT ON COLUMN public.therapists.contact_methods IS
  'Public contact-action availability. Allowed values: whatsapp, email, phone. Does not contain destinations.';
COMMENT ON COLUMN public.therapists.preferred_contact_method IS
  'Preferred public contact action; when present it must be one of contact_methods.';

-- Keep the existing atomic profile-save RPC intact. This wrapper participates
-- in the same PostgreSQL transaction, delegates the established profile and
-- relation writes to it, then persists the new contact-action fields.
CREATE OR REPLACE FUNCTION public.save_therapist_profile_with_contacts(
  _actor uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF jsonb_typeof(methods_json) <> 'array' THEN
    RAISE EXCEPTION 'contact_methods must be an array';
  END IF;

  SELECT COALESCE(array_agg(method ORDER BY first_ordinality), ARRAY[]::text[])
  INTO methods
  FROM (
    SELECT value AS method, min(ord) AS first_ordinality
    FROM jsonb_array_elements_text(methods_json) WITH ORDINALITY AS item(value, ord)
    GROUP BY value
  ) AS unique_methods;

  IF cardinality(methods) > 3 THEN
    RAISE EXCEPTION 'contact_methods may contain at most three methods';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(methods) AS method
    WHERE method NOT IN ('whatsapp', 'email', 'phone')
  ) THEN
    RAISE EXCEPTION 'unsupported contact method';
  END IF;

  preferred := NULLIF(_payload #>> '{profile,preferred_contact_method}', '');

  IF cardinality(methods) = 0 THEN
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
    preferred_contact_method = preferred
  WHERE id = therapist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'saved therapist was not found';
  END IF;

  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_therapist_profile_with_contacts(uuid, jsonb) TO service_role;

COMMIT;

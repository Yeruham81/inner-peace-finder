
DO $$ BEGIN
  CREATE TYPE public.therapist_visibility AS ENUM ('published','hidden_by_owner','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.claim_request_type AS ENUM ('claim_profile','remove_profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.claim_request_status ADD VALUE IF NOT EXISTS 'needs_information';

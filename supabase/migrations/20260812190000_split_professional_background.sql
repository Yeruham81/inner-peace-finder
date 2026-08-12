BEGIN;

ALTER TABLE public.therapists
  ADD COLUMN IF NOT EXISTS education_training text,
  ADD COLUMN IF NOT EXISTS professional_experience text;

COMMENT ON COLUMN public.therapists.education_training IS
  'Therapist-declared education, training, continuing education, and certifications.';

COMMENT ON COLUMN public.therapists.professional_experience IS
  'Therapist-declared employment history and professional experience.';

COMMIT;

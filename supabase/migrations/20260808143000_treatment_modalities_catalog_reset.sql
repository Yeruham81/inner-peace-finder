-- Tipulinks — canonical treatment modalities catalog reset
-- Date: 2026-08-08
-- Purpose: replace the legacy/placeholder treatment modality catalog with the
-- approved 34-item canonical catalog used by the therapist profile editor.
--
-- IMPORTANT: This intentionally removes all existing therapist↔modality links.
-- The project is still being built from scratch and legacy modality data is not
-- considered authoritative.

BEGIN;

-- Remove legacy selections first, then replace the catalog itself.
DELETE FROM public.therapist_modalities;
DELETE FROM public.treatment_modalities;

INSERT INTO public.treatment_modalities
  (slug, name_he, name_en, sort_order, is_active)
VALUES
  -- 1. דינמיות ועומק
  ('psychodynamic', 'טיפול פסיכודינמי', 'Psychodynamic Therapy', 10, true),
  ('psychoanalysis', 'פסיכואנליזה', 'Psychoanalysis', 20, true),
  ('relational', 'הגישה ההתייחסותית', 'Relational Psychotherapy', 30, true),
  ('mbt', 'טיפול מבוסס מנטליזציה (MBT)', 'Mentalization-Based Treatment (MBT)', 40, true),
  ('adlerian', 'פסיכותרפיה אדלריאנית', 'Adlerian Psychotherapy', 50, true),

  -- 2. קוגניטיביות והתנהגותיות
  ('cbt', 'טיפול קוגניטיבי־התנהגותי (CBT)', 'Cognitive Behavioral Therapy (CBT)', 110, true),
  ('act', 'טיפול בקבלה ומחויבות (ACT)', 'Acceptance and Commitment Therapy (ACT)', 120, true),
  ('dbt', 'טיפול דיאלקטי־התנהגותי (DBT)', 'Dialectical Behavior Therapy (DBT)', 130, true),
  ('schema-therapy', 'סכמה תרפיה', 'Schema Therapy', 140, true),
  ('mbct', 'טיפול קוגניטיבי מבוסס מיינדפולנס (MBCT)', 'Mindfulness-Based Cognitive Therapy (MBCT)', 150, true),
  ('cft', 'טיפול ממוקד חמלה (CFT)', 'Compassion Focused Therapy (CFT)', 160, true),
  ('erp', 'חשיפה ומניעת תגובה (ERP)', 'Exposure and Response Prevention (ERP)', 170, true),

  -- 3. טראומה ועיבוד
  ('emdr', 'EMDR', 'Eye Movement Desensitization and Reprocessing (EMDR)', 210, true),
  ('prolonged-exposure', 'חשיפה ממושכת (PE)', 'Prolonged Exposure (PE)', 220, true),
  ('cpt', 'טיפול בעיבוד קוגניטיבי (CPT)', 'Cognitive Processing Therapy (CPT)', 230, true),
  ('tf-cbt', 'CBT ממוקד טראומה (TF-CBT)', 'Trauma-Focused Cognitive Behavioral Therapy (TF-CBT)', 240, true),
  ('somatic-experiencing', 'Somatic Experiencing (SE)', 'Somatic Experiencing (SE)', 250, true),
  ('body-psychotherapy', 'פסיכותרפיה גופנית / גוף־נפש', 'Body Psychotherapy', 260, true),

  -- 4. הומניסטיות וחווייתיות
  ('person-centered', 'טיפול ממוקד אדם', 'Person-Centered Therapy', 310, true),
  ('emotion-focused', 'טיפול ממוקד רגש', 'Emotion-Focused Therapy', 320, true),
  ('gestalt', 'טיפול בגישת הגשטלט', 'Gestalt Therapy', 330, true),
  ('existential', 'טיפול אקזיסטנציאלי', 'Existential Therapy', 340, true),
  ('focusing', 'התמקדות (Focusing)', 'Focusing-Oriented Therapy', 350, true),
  ('psychodrama', 'פסיכודרמה', 'Psychodrama', 360, true),

  -- 5. מערכתיות ובין־אישיות
  ('systemic-family', 'טיפול מערכתי ומשפחתי', 'Systemic and Family Therapy', 410, true),
  ('eft-couples', 'טיפול זוגי ממוקד רגש (EFCT)', 'Emotionally Focused Couple Therapy (EFCT)', 420, true),
  ('narrative', 'טיפול נרטיבי', 'Narrative Therapy', 430, true),
  ('solution-focused', 'טיפול ממוקד פתרונות (SFBT)', 'Solution-Focused Brief Therapy (SFBT)', 440, true),
  ('ipt', 'פסיכותרפיה בין־אישית (IPT)', 'Interpersonal Psychotherapy (IPT)', 450, true),
  ('attachment-based', 'טיפול מבוסס התקשרות', 'Attachment-Based Therapy', 460, true),

  -- 6. אינטגרטיביות ונוספות
  ('integrative', 'טיפול אינטגרטיבי', 'Integrative Psychotherapy', 510, true),
  ('ifs', 'Internal Family Systems (IFS)', 'Internal Family Systems (IFS)', 520, true),
  ('play-therapy', 'טיפול במשחק', 'Play Therapy', 530, true),
  ('dyadic-parent-child', 'טיפול דיאדי / הורה–ילד', 'Dyadic Parent-Child Therapy', 540, true);

-- Fail the migration rather than leaving a partial/wrong catalog.
DO $$
DECLARE
  modality_count integer;
  active_count integer;
BEGIN
  SELECT count(*) INTO modality_count FROM public.treatment_modalities;
  SELECT count(*) INTO active_count FROM public.treatment_modalities WHERE is_active = true;

  IF modality_count <> 34 OR active_count <> 34 THEN
    RAISE EXCEPTION
      'Treatment modality catalog validation failed: total=%, active=% (expected 34/34)',
      modality_count,
      active_count;
  END IF;
END $$;

COMMIT;

-- Optional read-only verification after the transaction:
-- SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active
-- FROM public.treatment_modalities;
--
-- SELECT slug, name_he, sort_order
-- FROM public.treatment_modalities
-- ORDER BY sort_order, name_he;

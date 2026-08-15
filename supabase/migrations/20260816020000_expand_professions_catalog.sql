-- Tipulinks — expand the canonical profession catalog to 72 professions.
--
-- Architecture:
--   profession = what the practitioner is.
--   Populations, treatment/help domains, modalities and service characteristics
--   remain separate matching axes.
--
-- Compatibility:
--   * All 41 existing canonical slugs are preserved.
--   * Existing profession UUIDs are preserved through ON CONFLICT (slug).
--   * Legacy architectural overlaps such as cbt-psychotherapist and
--     body-psychotherapist remain active for backwards compatibility.
--   * Unknown/non-canonical rows are not deleted or deactivated by this migration.

BEGIN;

INSERT INTO public.professions
  (slug, name_he, name_en, sort_order, is_active)
VALUES
  -- 1. טיפול רגשי ופסיכותרפיה
  ('emotional-therapist', 'מטפל רגשי', 'Emotional therapist', 10, true),
  ('psychotherapist', 'פסיכותרפיסט', 'Psychotherapist', 20, true),
  ('cbt-psychotherapist', 'פסיכותרפיסט קוגניטיבי-התנהגותי', 'Cognitive behavioral psychotherapist', 30, true),
  ('body-psychotherapist', 'פסיכותרפיסט גופני', 'Body psychotherapist', 40, true),
  ('psychoanalyst', 'פסיכואנליטיקאי', 'Psychoanalyst', 50, true),
  ('other-therapeutic-profession', 'מקצוע טיפולי אחר', 'Other therapeutic profession', 60, true),

  -- 2. פסיכולוגיה ופסיכיאטריה
  ('psychologist', 'פסיכולוג', 'Psychologist', 70, true),
  ('clinical-psychologist', 'פסיכולוג קליני', 'Clinical psychologist', 80, true),
  ('educational-psychologist', 'פסיכולוג חינוכי', 'Educational psychologist', 90, true),
  ('medical-psychologist', 'פסיכולוג רפואי', 'Medical psychologist', 100, true),
  ('rehabilitation-psychologist', 'פסיכולוג שיקומי', 'Rehabilitation psychologist', 110, true),
  ('developmental-psychologist', 'פסיכולוג התפתחותי', 'Developmental psychologist', 120, true),
  ('occupational-organizational-psychologist', 'פסיכולוג תעסוקתי-ארגוני', 'Occupational-organizational psychologist', 130, true),
  ('psychiatrist', 'פסיכיאטר', 'Psychiatrist', 140, true),
  ('child-adolescent-psychiatrist', 'פסיכיאטר ילדים ונוער', 'Child and adolescent psychiatrist', 150, true),

  -- 3. עבודה סוציאלית, זוגיות, משפחה ומיניות
  ('social-worker', 'עובד סוציאלי', 'Social worker', 160, true),
  ('clinical-social-worker', 'עובד סוציאלי קליני', 'Clinical social worker', 170, true),
  ('couples-therapist', 'מטפל זוגי', 'Couples therapist', 180, true),
  ('family-therapist', 'מטפל משפחתי', 'Family therapist', 190, true),
  ('sex-therapist', 'מטפל מיני', 'Sex therapist', 200, true),
  ('parent-counselor', 'מדריך הורים', 'Parent counselor', 210, true),
  ('mediator', 'מגשר', 'Mediator', 220, true),

  -- 4. טיפול באומנויות, בעלי חיים וטבע
  ('arts-therapist', 'מטפל באמצעות אומנויות', 'Arts therapist', 230, true),
  ('visual-art-therapist', 'מטפל באמנות חזותית', 'Visual art therapist', 240, true),
  ('music-therapist', 'מטפל במוזיקה', 'Music therapist', 250, true),
  ('dance-movement-therapist', 'מטפל בתנועה ובמחול', 'Dance movement therapist', 260, true),
  ('drama-therapist', 'מטפל בדרמה', 'Drama therapist', 270, true),
  ('psychodrama-therapist', 'מטפל בפסיכודרמה', 'Psychodrama therapist', 280, true),
  ('bibliotherapist', 'ביבליותרפיסט', 'Bibliotherapist', 290, true),
  ('animal-assisted-therapist', 'מטפל בעזרת בעלי חיים', 'Animal-assisted therapist', 300, true),
  ('horticultural-therapist', 'מטפל באמצעות גינון', 'Horticultural therapist', 310, true),

  -- 5. בריאות, התפתחות ושיקום
  ('occupational-therapist', 'מרפא בעיסוק', 'Occupational therapist', 320, true),
  ('speech-language-pathologist', 'קלינאי תקשורת', 'Speech-language pathologist', 330, true),
  ('physiotherapist', 'פיזיותרפיסט', 'Physiotherapist', 340, true),
  ('clinical-dietitian', 'דיאטן קליני', 'Clinical dietitian', 350, true),
  ('clinical-criminologist', 'קרימינולוג קליני', 'Clinical criminologist', 360, true),
  ('social-rehabilitation-criminologist', 'קרימינולוג חברתי-שיקומי', 'Social-rehabilitation criminologist', 370, true),
  ('behavior-analyst', 'מנתח התנהגות', 'Behavior analyst', 380, true),
  ('hydrotherapist', 'הידרותרפיסט', 'Hydrotherapist', 390, true),

  -- 6. ייעוץ, אבחון, הדרכה, ליווי ואימון
  ('educational-counselor', 'יועץ חינוכי', 'Educational counselor', 400, true),
  ('didactic-diagnostician', 'מאבחן דידקטי', 'Didactic diagnostician', 410, true),
  ('group-facilitator', 'מנחה קבוצות', 'Group facilitator', 420, true),
  ('life-coach', 'מאמן אישי', 'Life coach', 430, true),
  ('sleep-consultant', 'יועץ שינה', 'Sleep consultant', 440, true),
  ('lactation-consultant', 'יועץ הנקה', 'Lactation consultant', 450, true),
  ('career-counselor', 'יועץ קריירה', 'Career counselor', 460, true),
  ('nutrition-consultant', 'יועץ תזונה', 'Nutrition consultant', 470, true),
  ('doula', 'דולה', 'Doula', 480, true),
  ('adaptive-teaching-specialist', 'מומחה להוראה מותאמת', 'Adaptive teaching specialist', 490, true),
  ('spiritual-care-provider', 'מלווה רוחני', 'Spiritual care provider', 500, true),

  -- 7. רפואה משלימה ושיטות טיפול מסורתיות
  ('chinese-medicine-practitioner', 'מטפל ברפואה סינית', 'Chinese medicine practitioner', 510, true),
  ('acupuncturist', 'מדקר', 'Acupuncturist', 520, true),
  ('naturopath', 'נטורופת', 'Naturopath', 530, true),
  ('homeopath', 'הומאופת', 'Homeopath', 540, true),
  ('bach-flower-practitioner', 'מטפל בפרחי באך', 'Bach flower practitioner', 550, true),
  ('aromatherapist', 'ארומתרפיסט', 'Aromatherapist', 560, true),
  ('herbal-medicine-practitioner', 'מטפל בצמחי מרפא / הרבליסט', 'Herbal medicine practitioner', 570, true),
  ('ayurveda-practitioner', 'מטפל באיורוודה', 'Ayurveda practitioner', 580, true),

  -- 8. טיפולי גוף, מגע, תנועה וויסות
  ('reflexologist', 'רפלקסולוג', 'Reflexologist', 590, true),
  ('shiatsu-practitioner', 'מטפל בשיאצו', 'Shiatsu practitioner', 600, true),
  ('tuina-practitioner', 'מטפל בטווינא', 'Tuina practitioner', 610, true),
  ('osteopath', 'אוסטאופת', 'Osteopath', 620, true),
  ('chiropractor', 'כירופרקט', 'Chiropractor', 630, true),
  ('massage-therapist', 'מטפל בעיסוי', 'Massage therapist', 640, true),
  ('feldenkrais-practitioner', 'מטפל בשיטת פלדנקרייז', 'Feldenkrais practitioner', 650, true),
  ('alexander-technique-teacher', 'מורה לשיטת אלכסנדר', 'Alexander Technique teacher', 660, true),
  ('paula-method-practitioner', 'מטפל בשיטת פאולה', 'Paula Method practitioner', 670, true),
  ('yoga-therapist', 'מטפל ביוגה טיפולית', 'Yoga therapist', 680, true),
  ('reiki-practitioner', 'מטפל ברייקי', 'Reiki practitioner', 690, true),
  ('craniosacral-therapist', 'מטפל בקרניוסקרל', 'Craniosacral therapist', 700, true),
  ('biofeedback-therapist', 'מטפל בביופידבק', 'Biofeedback therapist', 710, true),
  ('neurofeedback-therapist', 'מטפל בנוירופידבק', 'Neurofeedback therapist', 720, true)
ON CONFLICT (slug) DO UPDATE
SET
  name_he = EXCLUDED.name_he,
  name_en = EXCLUDED.name_en,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Fail atomically if the canonical catalog was not fully materialized.
DO $$
DECLARE
  canonical_active_count integer;
BEGIN
  SELECT count(*)
  INTO canonical_active_count
  FROM public.professions
  WHERE is_active = true
    AND slug IN (
      'emotional-therapist', 'psychotherapist', 'cbt-psychotherapist',
      'body-psychotherapist', 'psychoanalyst', 'other-therapeutic-profession',
      'psychologist', 'clinical-psychologist', 'educational-psychologist',
      'medical-psychologist', 'rehabilitation-psychologist', 'developmental-psychologist',
      'occupational-organizational-psychologist', 'psychiatrist', 'child-adolescent-psychiatrist',
      'social-worker', 'clinical-social-worker', 'couples-therapist', 'family-therapist',
      'sex-therapist', 'parent-counselor', 'mediator',
      'arts-therapist', 'visual-art-therapist', 'music-therapist',
      'dance-movement-therapist', 'drama-therapist', 'psychodrama-therapist',
      'bibliotherapist', 'animal-assisted-therapist', 'horticultural-therapist',
      'occupational-therapist', 'speech-language-pathologist', 'physiotherapist',
      'clinical-dietitian', 'clinical-criminologist', 'social-rehabilitation-criminologist',
      'behavior-analyst', 'hydrotherapist', 'educational-counselor',
      'didactic-diagnostician', 'group-facilitator', 'life-coach', 'sleep-consultant',
      'lactation-consultant', 'career-counselor', 'nutrition-consultant', 'doula',
      'adaptive-teaching-specialist', 'spiritual-care-provider',
      'chinese-medicine-practitioner', 'acupuncturist', 'naturopath', 'homeopath',
      'bach-flower-practitioner', 'aromatherapist', 'herbal-medicine-practitioner',
      'ayurveda-practitioner', 'reflexologist', 'shiatsu-practitioner',
      'tuina-practitioner', 'osteopath', 'chiropractor', 'massage-therapist',
      'feldenkrais-practitioner', 'alexander-technique-teacher',
      'paula-method-practitioner', 'yoga-therapist', 'reiki-practitioner',
      'craniosacral-therapist', 'biofeedback-therapist', 'neurofeedback-therapist'
    );

  IF canonical_active_count <> 72 THEN
    RAISE EXCEPTION 'Expected 72 active canonical professions, found %', canonical_active_count;
  END IF;
END
$$;

COMMIT;

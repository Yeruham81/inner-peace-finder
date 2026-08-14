-- Canonical treatment-ontology expansion.
--
-- Guarantees:
--   * Active, top-level domains are the only new semantic targets.
--   * Every homepage topic label has one primary canonical owner.
--   * Inserts are idempotent and never depend on numeric problem ids.
--   * Broad one-word noise is not introduced for sleep difficulties.

INSERT INTO public.problems (slug, name_he, name_en, parent_id, is_active, sort_order)
VALUES
  ('sleep_difficulties', 'קשיי שינה', 'Sleep Difficulties', NULL, true, 23),
  ('sexuality_intimacy', 'מיניות ואינטימיות', 'Sexuality and Intimacy', NULL, true, 24),
  ('violence_abuse', 'אלימות ומערכות יחסים פוגעניות', 'Violence and Abuse', NULL, true, 25)
ON CONFLICT (slug) DO UPDATE
SET name_he = EXCLUDED.name_he,
    name_en = EXCLUDED.name_en,
    parent_id = NULL,
    is_active = true,
    sort_order = EXCLUDED.sort_order;

WITH candidates(slug, alias) AS (
  VALUES
    ('anxiety', 'חרדה חברתית'),
    ('anxiety', 'התקפי פאניקה'),
    ('anxiety', 'חרדת בריאות'),
    ('anxiety', 'פחד מטיסה'),
    ('anxiety', 'פוביות'),
    ('anxiety', 'דאגנות יתר'),
    ('anxiety', 'חרדת מבחנים'),
    ('ocd_compulsions', 'מחשבות טורדניות'),
    ('depression', 'דיכאון'),
    ('depression', 'מצב רוח ירוד'),
    ('social_belonging', 'בדידות'),
    ('depression', 'חוסר מוטיבציה'),
    ('depression', 'תחושת ריקנות'),
    ('sleep_difficulties', 'קשיי שינה'),
    ('depression', 'ייאוש'),
    ('emotional_regulation', 'שינויים חדים במצב הרוח'),
    ('relationships', 'משבר בזוגיות'),
    ('communication_expression', 'קשיי תקשורת'),
    ('relationships', 'פרידה וגירושין'),
    ('relationships', 'קנאה וחוסר אמון'),
    ('sexuality_intimacy', 'אינטימיות ומיניות'),
    ('relationships', 'קושי ביצירת קשר'),
    ('relationships', 'תלות רגשית'),
    ('violence_abuse', 'מערכות יחסים פוגעניות'),
    ('trauma', 'פוסט טראומה'),
    ('grief_loss', 'אובדן ואבל'),
    ('life_transitions', 'משבר אישי'),
    ('somatic', 'מחלה או פציעה'),
    ('sexual_abuse_trauma', 'פגיעה מינית'),
    ('violence_abuse', 'אלימות'),
    ('life_transitions', 'שינוי משמעותי בחיים'),
    ('trauma', 'התמודדות לאחר אירוע ביטחוני'),
    ('social_belonging', 'קשיים חברתיים'),
    ('emotional_regulation', 'התפרצויות זעם'),
    ('family_parenting', 'הדרכת הורים'),
    ('life_transitions', 'קשיי הסתגלות'),
    ('anxiety', 'פחדים אצל ילדים'),
    ('family_parenting', 'יחסים בין אחים'),
    ('family_parenting', 'גירושי הורים'),
    ('developmental', 'קשיים בבית הספר'),
    ('performance_functioning', 'שחיקה בעבודה'),
    ('performance_functioning', 'לחץ בעבודה'),
    ('performance_functioning', 'דחיינות'),
    ('neurodiversity', 'קשיי ריכוז'),
    ('performance_functioning', 'בחירת קריירה'),
    ('performance_functioning', 'חוסר ביטחון מקצועי'),
    ('performance_functioning', 'איזון בין עבודה לחיים'),
    ('self_identity', 'דימוי עצמי נמוך'),
    ('self_identity', 'חוסר ביטחון'),
    ('self_identity', 'קושי בהצבת גבולות'),
    ('self_identity', 'ריצוי אחרים'),
    ('self_identity', 'קבלת החלטות'),
    ('self_identity', 'משבר זהות'),
    ('life_transitions', 'תחושת תקיעות'),
    ('self_identity', 'התפתחות אישית'),
    ('eating_body', 'אכילה רגשית'),
    ('eating_body', 'הפרעות אכילה'),
    ('eating_body', 'דימוי גוף'),
    ('addiction', 'התמכרויות'),
    ('addiction', 'עישון'),
    ('addiction', 'שימוש באלכוהול'),
    ('addiction', 'הרגלים כפייתיים'),
    ('addiction', 'קושי בשינוי הרגלים'),
    ('eating_body', 'קשיי אכילה'),
    ('anxiety', 'קשיי פרידה'),
    ('emotional_regulation', 'ויסות רגשי'),
    ('developmental', 'עיכוב התפתחותי'),
    ('emotional_regulation', 'התפרצויות והתנהגות מאתגרת'),
    ('developmental', 'הסתגלות למסגרת'),
    ('anxiety', 'חרדה ופחדים'),
    ('neurodiversity', 'קשיי קשב וריכוז'),
    ('emotional_regulation', 'התפרצויות וכעסים'),
    ('family_parenting', 'התמודדות עם גירושי הורים'),
    ('self_identity', 'דימוי עצמי'),
    ('depression', 'דיכאון ושינויים במצב הרוח'),
    ('social_belonging', 'קשיים חברתיים ובדידות'),
    ('family_parenting', 'יחסים עם ההורים'),
    ('performance_functioning', 'לחץ לימודי'),
    ('anxiety', 'חרדה ולחץ'),
    ('relationships', 'זוגיות ומערכות יחסים'),
    ('performance_functioning', 'לימודים וקריירה'),
    ('self_identity', 'זהות וכיוון בחיים'),
    ('social_belonging', 'בדידות וקשיים חברתיים'),
    ('relationships', 'פרידות ומשברים'),
    ('life_transitions', 'עצמאות ומעבר לחיים בוגרים'),
    ('anxiety', 'חרדה ודאגנות'),
    ('depression', 'דיכאון ומצב רוח ירוד'),
    ('performance_functioning', 'שחיקה ולחץ בעבודה'),
    ('life_transitions', 'משברים אישיים'),
    ('relationships', 'קשיים בזוגיות'),
    ('trauma', 'טראומה ואובדן'),
    ('life_transitions', 'שינויי חיים'),
    ('depression', 'דיכאון וחרדה'),
    ('life_transitions', 'הסתגלות לפרישה'),
    ('somatic', 'שינויים בריאותיים'),
    ('somatic', 'ירידה בתפקוד'),
    ('family_parenting', 'יחסים במשפחה'),
    ('existential', 'משמעות ואיכות חיים'),
    ('relationships', 'בגידה ואובדן אמון'),
    ('relationships', 'קונפליקטים חוזרים'),
    ('family_parenting', 'הורות משותפת'),
    ('relationships', 'הכנה לנישואין'),
    ('family_parenting', 'יחסי הורים וילדים'),
    ('family_parenting', 'מריבות וקונפליקטים במשפחה'),
    ('family_parenting', 'קשיים בין אחים'),
    ('family_parenting', 'גירושין ומשפחה בתהליך שינוי'),
    ('family_parenting', 'משפחות משולבות'),
    ('family_parenting', 'התמודדות עם ילד במשבר'),
    ('family_parenting', 'ילד במשבר'),
    ('family_parenting', 'טיפול משפחתי'),
    -- Additional precise natural-language vocabulary.
    ('sleep_difficulties', 'בעיות שינה'),
    ('sleep_difficulties', 'הפרעות שינה'),
    ('sleep_difficulties', 'הפרעת שינה'),
    ('sleep_difficulties', 'נדודי שינה'),
    ('sleep_difficulties', 'אינסומניה'),
    ('sleep_difficulties', 'קושי להירדם'),
    ('sleep_difficulties', 'קושי בהירדמות'),
    ('sleep_difficulties', 'יקיצות מרובות'),
    ('sleep_difficulties', 'שינה לא רציפה'),
    ('sexuality_intimacy', 'קשיים באינטימיות'),
    ('sexuality_intimacy', 'קשיים במיניות'),
    ('sexuality_intimacy', 'קשיים מיניים'),
    ('sexuality_intimacy', 'טיפול מיני'),
    ('sexuality_intimacy', 'פחד מאינטימיות'),
    ('violence_abuse', 'אלימות במשפחה'),
    ('violence_abuse', 'אלימות בזוגיות'),
    ('violence_abuse', 'התעללות רגשית'),
    ('violence_abuse', 'התעללות פיזית'),
    ('violence_abuse', 'קשר פוגעני'),
    ('violence_abuse', 'זוגיות פוגענית'),
    ('violence_abuse', 'מערכת יחסים פוגענית')
)
INSERT INTO public.problem_aliases (problem_id, alias)
SELECT p.id, c.alias
FROM candidates c
JOIN public.problems p ON p.slug = c.slug AND p.is_active = true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.problem_aliases a
  WHERE a.problem_id = p.id
    AND lower(trim(a.alias)) = lower(trim(c.alias))
);

-- User-voice intents are kept short, specific and canonical-slug based.
WITH candidates(problem_slug, intent_text) AS (
  VALUES
    ('sleep_difficulties', 'אני לא מצליח להירדם בלילה'),
    ('sleep_difficulties', 'אני לא מצליחה להירדם בלילה'),
    ('sleep_difficulties', 'אני מתעורר הרבה בלילה'),
    ('sleep_difficulties', 'אני מתעוררת הרבה בלילה'),
    ('sleep_difficulties', 'השינה שלי לא רציפה'),
    ('sexuality_intimacy', 'קשה לי באינטימיות'),
    ('sexuality_intimacy', 'יש לי קשיים במיניות'),
    ('sexuality_intimacy', 'אני נמנע מקרבה מינית'),
    ('violence_abuse', 'אני נמצא במערכת יחסים פוגענית'),
    ('violence_abuse', 'אני מפחד מאלימות בבית'),
    ('violence_abuse', 'אני חווה אלימות במשפחה'),
    ('grief_loss', 'טראומה ואובדן'),
    ('life_transitions', 'פרידות ומשברים'),
    ('anxiety', 'דיכאון וחרדה'),
    ('relationships', 'גירושין ומשפחה בתהליך שינוי')
)
INSERT INTO public.problem_intents (problem_slug, intent_text)
SELECT c.problem_slug, c.intent_text
FROM candidates c
JOIN public.problems p ON p.slug = c.problem_slug AND p.is_active = true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.problem_intents i
  WHERE i.problem_slug = c.problem_slug
    AND lower(trim(i.intent_text)) = lower(trim(c.intent_text))
);

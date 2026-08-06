-- Phase 3A — treatment-domain catalog update (catalog data only).
--
-- Adds two active canonical domains, adds safe professional aliases to
-- existing ACTIVE domains, promotes useful terminology from INACTIVE child
-- concepts to their active parents (aliases only), removes verified
-- duplicate alias rows and removes exact unsafe standalone aliases.
--
-- Guarantees:
--   * Idempotent and safe to rerun.
--   * Canonical slugs only, no hard-coded ids.
--   * No canonical problem is deleted, renamed, merged, activated,
--     deactivated or reparented.
--   * No wildcard deletion; exact normalized equality only.
--   * No schema/index changes; no therapist rows touched.

-- ---------------------------------------------------------------------------
-- 1. New active canonical problems (top-level)
-- ---------------------------------------------------------------------------

INSERT INTO public.problems (slug, name_he, name_en, parent_id, is_active, sort_order)
SELECT 'personality_disorders', 'הפרעות אישיות', 'Personality Disorders', NULL, true, 21
WHERE NOT EXISTS (SELECT 1 FROM public.problems WHERE slug = 'personality_disorders');

INSERT INTO public.problems (slug, name_he, name_en, parent_id, is_active, sort_order)
SELECT 'sexual_abuse_trauma', 'פגיעות מיניות וטראומה מינית', 'Sexual Abuse and Sexual Trauma', NULL, true, 22
WHERE NOT EXISTS (SELECT 1 FROM public.problems WHERE slug = 'sexual_abuse_trauma');

-- ---------------------------------------------------------------------------
-- 2. Aliases on ACTIVE canonical domains
-- ---------------------------------------------------------------------------

WITH candidates(slug, alias) AS (
  VALUES
    -- new domains
    ('personality_disorders', 'הפרעת אישיות'),
    ('personality_disorders', 'הפרעות אישיות'),
    ('sexual_abuse_trauma', 'פגיעה מינית'),
    ('sexual_abuse_trauma', 'פגיעות מיניות'),
    ('sexual_abuse_trauma', 'טראומה מינית'),
    ('sexual_abuse_trauma', 'תקיפה מינית'),
    ('sexual_abuse_trauma', 'התעללות מינית'),
    ('sexual_abuse_trauma', 'נפגעי תקיפה מינית'),
    ('sexual_abuse_trauma', 'נפגעות תקיפה מינית'),
    -- trauma
    ('trauma', 'טראומה מורכבת'),
    ('trauma', 'טראומת ילדות'),
    ('trauma', 'טראומה בילדות'),
    ('trauma', 'CPTSD'),
    ('trauma', 'C-PTSD'),
    ('trauma', 'הפרעת דחק פוסט טראומטית'),
    -- anxiety
    ('anxiety', 'חרדה חברתית'),
    ('anxiety', 'התקף פאניקה'),
    ('anxiety', 'התקפי פאניקה'),
    ('anxiety', 'פוביה'),
    ('anxiety', 'פוביות'),
    ('anxiety', 'חרדת בריאות'),
    ('anxiety', 'חרדה מוכללת'),
    ('anxiety', 'הפרעת חרדה מוכללת'),
    -- ocd_compulsions
    ('ocd_compulsions', 'טקס כפייתי'),
    ('ocd_compulsions', 'טקסים כפייתיים'),
    ('ocd_compulsions', 'מחשבות חודרניות'),
    ('ocd_compulsions', 'התנהגות כפייתית'),
    ('ocd_compulsions', 'התנהגויות כפייתיות'),
    -- self_identity
    ('self_identity', 'משבר זהות'),
    ('self_identity', 'קשיי זהות'),
    ('self_identity', 'קשיים בזהות העצמית'),
    ('self_identity', 'זהות עצמית'),
    -- family_parenting
    ('family_parenting', 'קשיים בהורות'),
    ('family_parenting', 'מתח הורי'),
    ('family_parenting', 'קונפליקטים בין הורים לילדים'),
    ('family_parenting', 'קשיים ביחסי הורים וילדים'),
    ('family_parenting', 'יחסי הורים וילדים'),
    -- emotional_regulation
    ('emotional_regulation', 'ויסות רגשי'),
    ('emotional_regulation', 'קשיים בוויסות רגשי'),
    ('emotional_regulation', 'הצפה רגשית'),
    ('emotional_regulation', 'התפרצויות זעם'),
    ('emotional_regulation', 'קשיים בשליטה בכעסים'),
    ('emotional_regulation', 'קושי בשליטה בכעסים'),
    -- neurodiversity
    ('neurodiversity', 'ADHD'),
    ('neurodiversity', 'הפרעת קשב וריכוז'),
    ('neurodiversity', 'קשיי קשב וריכוז'),
    ('neurodiversity', 'אוטיזם'),
    ('neurodiversity', 'הספקטרום האוטיסטי'),
    ('neurodiversity', 'ספקטרום אוטיסטי'),
    -- eating_body
    ('eating_body', 'הפרעות אכילה'),
    ('eating_body', 'הפרעת אכילה'),
    ('eating_body', 'אנורקסיה'),
    ('eating_body', 'בולימיה'),
    ('eating_body', 'אכילה רגשית'),
    ('eating_body', 'דימוי גוף'),
    ('eating_body', 'קשיים בדימוי הגוף'),
    ('eating_body', 'דימוי גוף שלילי'),
    -- social_belonging
    ('social_belonging', 'בדידות'),
    ('social_belonging', 'קשיים חברתיים'),
    ('social_belonging', 'קושי חברתי'),
    ('social_belonging', 'קושי ביצירת קשרים חברתיים'),
    ('social_belonging', 'קשיים ביצירת קשרים חברתיים'),
    ('social_belonging', 'תחושת חוסר שייכות'),
    ('social_belonging', 'חוסר שייכות'),
    -- relationships
    ('relationships', 'קשיים בזוגיות'),
    ('relationships', 'קושי בזוגיות'),
    ('relationships', 'משבר זוגי'),
    ('relationships', 'פרידה זוגית'),
    ('relationships', 'התמודדות עם פרידה'),
    ('relationships', 'תהליך גירושין'),
    ('relationships', 'התמודדות עם גירושין'),
    ('relationships', 'גירושין'),
    -- performance_functioning
    ('performance_functioning', 'שחיקה בעבודה'),
    ('performance_functioning', 'שחיקה מקצועית'),
    ('performance_functioning', 'תחושת שחיקה'),
    ('performance_functioning', 'קושי בתפקוד'),
    ('performance_functioning', 'קשיים בתפקוד'),
    ('performance_functioning', 'דחיינות')
)
INSERT INTO public.problem_aliases (problem_id, alias)
SELECT p.id, c.alias
FROM candidates c
JOIN public.problems p ON p.slug = c.slug AND p.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.problem_aliases a
  WHERE a.problem_id = p.id
    AND lower(trim(a.alias)) = lower(trim(c.alias))
);

-- ---------------------------------------------------------------------------
-- 3. Same-domain duplicate cleanup (retain the lowest primary key)
-- ---------------------------------------------------------------------------

DELETE FROM public.problem_aliases a
USING public.problem_aliases keep
WHERE a.problem_id = keep.problem_id
  AND lower(trim(a.alias)) = lower(trim(keep.alias))
  AND a.id > keep.id;

-- ---------------------------------------------------------------------------
-- 4. Inactive-child duplicates of approved active-parent aliases
--    (keeping both would create competing classification)
-- ---------------------------------------------------------------------------

WITH moved(child_slug, parent_slug, alias) AS (
  VALUES
    ('loneliness', 'social_belonging', 'בדידות'),
    ('divorce', 'relationships', 'גירושין'),
    ('couples_conflict', 'relationships', 'משבר זוגי'),
    ('procrastination', 'performance_functioning', 'דחיינות'),
    ('burnout', 'performance_functioning', 'שחיקה בעבודה'),
    ('body_image', 'eating_body', 'דימוי גוף'),
    ('emotional_overwhelm', 'emotional_regulation', 'הצפה רגשית'),
    ('anger', 'emotional_regulation', 'התפרצויות זעם'),
    ('panic', 'anxiety', 'התקף פאניקה'),
    ('panic', 'anxiety', 'התקפי פאניקה'),
    ('social_anxiety', 'anxiety', 'חרדה חברתית'),
    ('health_anxiety', 'anxiety', 'חרדת בריאות'),
    ('childhood_trauma', 'trauma', 'טראומת ילדות'),
    ('ptsd', 'trauma', 'פוסט טראומה'),
    ('intrusive_thoughts', 'ocd_compulsions', 'מחשבות חודרניות'),
    ('intrusive_thoughts', 'ocd_compulsions', 'מחשבות טורדניות'),
    ('identity_crisis', 'self_identity', 'משבר זהות'),
    ('low_self_esteem', 'self_identity', 'דימוי עצמי נמוך'),
    ('low_self_esteem', 'self_identity', 'ביטחון עצמי נמוך'),
    ('low_self_esteem', 'self_identity', 'חוסר ביטחון עצמי'),
    ('low_mood', 'depression', 'אני על הפנים')
)
DELETE FROM public.problem_aliases a
USING moved m, public.problems child, public.problems parent
WHERE a.problem_id = child.id
  AND child.slug = m.child_slug
  AND child.is_active = false
  AND parent.slug = m.parent_slug
  AND parent.is_active = true
  AND lower(trim(a.alias)) = lower(trim(m.alias))
  AND EXISTS (
    SELECT 1 FROM public.problem_aliases pa
    WHERE pa.problem_id = parent.id
      AND lower(trim(pa.alias)) = lower(trim(m.alias))
  );

-- ---------------------------------------------------------------------------
-- 5. Unsafe standalone aliases (exact normalized equality only)
-- ---------------------------------------------------------------------------

DELETE FROM public.problem_aliases a
WHERE lower(trim(a.alias)) IN (
  'אבל', 'אובדן', 'שכול', 'לחץ', 'משבר', 'כעס', 'זעם', 'סמים', 'פרידה',
  'דאון', 'גמור', 'שחוק', 'כפייתיות', 'פלאשבקים', 'סיוטים', 'שימוש לרעה',
  'הורים', 'עצמי'
);
-- Phase P3.2b — safe professional-register aliases for EXISTING ACTIVE
-- canonical problems, used by the therapist profile-editor domain feedback.
-- Idempotent: each alias is inserted only when an equivalent alias does not
-- already exist for that problem. No canonical problems are added, renamed,
-- merged, activated, deactivated or deleted. No existing aliases are changed.

WITH candidates(slug, alias) AS (
  VALUES
    ('depression', 'דיכאון'),
    ('depression', 'דיכאונות'),
    ('depression', 'תסמיני דיכאון'),
    ('depression', 'מצב דיכאוני'),
    ('anxiety', 'חרדה'),
    ('anxiety', 'חרדות'),
    ('anxiety', 'הפרעת חרדה'),
    ('anxiety', 'הפרעות חרדה'),
    ('anxiety', 'דאגנות יתר'),
    ('ocd_compulsions', 'OCD'),
    ('ocd_compulsions', 'הפרעה טורדנית כפייתית'),
    ('ocd_compulsions', 'הפרעה אובססיבית קומפולסיבית'),
    ('ocd_compulsions', 'מחשבות טורדניות'),
    ('ocd_compulsions', 'מחשבות כפייתיות'),
    ('ocd_compulsions', 'טורדנות כפייתית'),
    ('addiction', 'התמכרות'),
    ('addiction', 'התמכרויות'),
    ('addiction', 'התנהגות ממכרת'),
    ('trauma', 'טראומה'),
    ('trauma', 'PTSD'),
    ('trauma', 'פוסט טראומה'),
    ('trauma', 'הפרעה פוסט טראומטית'),
    ('trauma', 'אירוע טראומטי'),
    ('trauma', 'חוויות טראומטיות'),
    ('trauma', 'טראומה נפשית'),
    ('life_transitions', 'משבר חיים'),
    ('life_transitions', 'משברי חיים'),
    ('life_transitions', 'משברים בחיים'),
    ('life_transitions', 'משבר אישי'),
    ('life_transitions', 'משברים אישיים'),
    ('self_identity', 'דימוי עצמי'),
    ('self_identity', 'דימוי עצמי נמוך'),
    ('self_identity', 'קשיים בדימוי העצמי'),
    ('self_identity', 'ערך עצמי נמוך'),
    ('self_identity', 'ביטחון עצמי נמוך'),
    ('self_identity', 'חוסר ביטחון עצמי'),
    ('grief_loss', 'אבל ושכול'),
    ('grief_loss', 'תהליך אבל'),
    ('grief_loss', 'התמודדות עם אבל'),
    ('grief_loss', 'התמודדות עם אובדן'),
    ('grief_loss', 'אובדן אדם קרוב'),
    ('family_parenting', 'הדרכת הורים'),
    ('family_parenting', 'הדרכה הורית'),
    ('family_parenting', 'ייעוץ להורים'),
    ('family_parenting', 'ליווי הורים'),
    ('family_parenting', 'תמיכה הורית')
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

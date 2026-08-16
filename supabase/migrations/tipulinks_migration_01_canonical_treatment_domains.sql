-- Tipulinks — Migration 1: canonical treatment domains
-- Target: exactly 62 active canonical domains.
-- Scope: public.problems ONLY.
-- Does NOT modify problem_aliases or semantic_profile.
-- Designed to be rerunnable and non-destructive to existing problem IDs.

begin;

select pg_advisory_xact_lock(hashtext('tipulinks_treatment_domains_catalog_v1'));

create temporary table _canonical_problems (
  sort_order integer primary key,
  slug text unique not null,
  name_he text not null,
  name_en text not null,
  description text
) on commit drop;

insert into _canonical_problems (sort_order, slug, name_he, name_en, description)
values
  (1, 'anxiety', 'חרדה ופחדים', 'Anxiety & Fears', 'חרדה, פחדים ודאגה מתמשכת, לרבות ביטויים כגון חרדה חברתית, פאניקה וחרדת בריאות לפי ההקשר.'),
  (2, 'depression', 'דיכאון ומצב רוח ירוד', 'Depression & Low Mood', 'דיכאון, מצב רוח ירוד, עצב מתמשך, חוסר הנאה וירידה במוטיבציה לפי ההקשר.'),
  (3, 'ocd_compulsions', 'OCD ומחשבות או התנהגויות כפייתיות', 'OCD, Obsessions & Compulsions', 'OCD, מחשבות אובססיביות, טקסים והתנהגויות כפייתיות.'),
  (4, 'emotional_regulation', 'ויסות רגשי, כעס והצפה', 'Emotional Regulation, Anger & Overwhelm', 'קשיים בוויסות רגשי, כעס, התפרצויות והצפה רגשית.'),
  (5, 'self_identity', 'דימוי עצמי, ערך עצמי וזהות', 'Self-Image, Self-Worth & Identity', 'דימוי עצמי, ערך עצמי, ביטחון עצמי ושאלות הנוגעות לזהות האישית.'),
  (6, 'personality_disorders', 'הפרעות אישיות', 'Personality Disorders', 'התמודדות טיפולית עם הפרעות אישיות ודפוסים אישיותיים מתמשכים.'),
  (7, 'bipolar_disorder', 'הפרעה דו־קוטבית', 'Bipolar Disorder', 'התמודדות טיפולית עם הפרעה דו־קוטבית ושינויים הקשורים למצב הרוח במסגרת טיפול מתאימה.'),
  (8, 'psychosis', 'פסיכוזה והפרעות פסיכוטיות', 'Psychosis & Psychotic Disorders', 'התמודדות ושיקום סביב פסיכוזה והפרעות פסיכוטיות במסגרת טיפול מתאימה.'),
  (9, 'existential', 'שאלות קיום, משמעות וכיוון בחיים', 'Existential Questions, Meaning & Life Direction', 'שאלות קיומיות, חיפוש משמעות, מטרות וכיוון בחיים.'),
  (10, 'trauma', 'טראומה ופוסט־טראומה', 'Trauma & Post-Traumatic Stress', 'טראומה, פוסט־טראומה, טראומה מורכבת וחוויות טראומטיות.'),
  (11, 'sexual_abuse_trauma', 'פגיעות מיניות וטראומה מינית', 'Sexual Abuse & Sexual Trauma', 'התמודדות עם פגיעה מינית, תקיפה מינית וטראומה מינית.'),
  (12, 'violence_abuse', 'אלימות ומערכות יחסים פוגעניות', 'Violence & Abusive Relationships', 'התמודדות עם אלימות, התעללות ומערכות יחסים פוגעניות.'),
  (13, 'grief_loss', 'אבל, אובדן ושכול', 'Grief, Loss & Bereavement', 'אבל, אובדן, שכול והתמודדות לאחר מוות או אובדן משמעותי.'),
  (14, 'life_transitions', 'מעברי חיים והסתגלות', 'Life Transitions & Adjustment', 'הסתגלות לשינויים משמעותיים, מעברי חיים ומצבים חדשים.'),
  (15, 'relationships', 'זוגיות והיקשרות', 'Relationships & Attachment', 'קשיים בזוגיות, היקשרות, אמון, פרידה וקונפליקטים זוגיים לפי ההקשר.'),
  (16, 'family_parenting', 'משפחה והורות', 'Family & Parenting', 'הורות, יחסי הורים וילדים, יחסים משפחתיים וקונפליקטים במשפחה.'),
  (17, 'social_belonging', 'בדידות, שייכות וקשרים חברתיים', 'Loneliness, Belonging & Social Relationships', 'בדידות, תחושת שייכות, יצירת קשרים חברתיים והשתלבות חברתית.'),
  (18, 'communication_expression', 'תקשורת בין־אישית וביטוי רגשי', 'Interpersonal Communication & Emotional Expression', 'תקשורת בין־אישית, ביטוי רגשי, הצבת גבולות והבעת צרכים ורגשות.'),
  (19, 'sexuality_intimacy', 'מיניות ואינטימיות', 'Sexuality & Intimacy', 'מיניות, אינטימיות, קרבה וקשיים מיניים במסגרת טיפול מתאימה.'),
  (20, 'adhd', 'קשב, ADHD ותפקודים ניהוליים', 'ADHD, Attention & Executive Functions', 'ADHD, קשב וריכוז ותפקודים ניהוליים כגון ארגון, תכנון וניהול משימות.'),
  (21, 'autism', 'אוטיזם והספקטרום האוטיסטי', 'Autism Spectrum', 'אוטיזם והספקטרום האוטיסטי, לרבות תמיכה בתפקוד ובהסתגלות.'),
  (22, 'childhood_development', 'עיכובים וקשיים התפתחותיים', 'Developmental Delays & Difficulties', 'עיכובים וקשיים התפתחותיים בילדות בתחומי התפקוד וההתפתחות.'),
  (23, 'sensory_processing', 'ויסות ועיבוד חושי', 'Sensory Regulation & Processing', 'קשיים בוויסות חושי ובעיבוד מידע חושי.'),
  (24, 'behavioral_challenges', 'התנהגות מאתגרת וקשיי התנהגות', 'Behavioral Challenges', 'התנהגות מאתגרת, קשיי התנהגות והתנהגויות המקשות על התפקוד היומיומי.'),
  (25, 'learning_difficulties', 'לקויות וקשיי למידה', 'Learning Disabilities & Difficulties', 'לקויות למידה וקשיים ברכישת מיומנויות לימודיות כגון קריאה, כתיבה וחשבון.'),
  (26, 'motor_coordination', 'קואורדינציה והתפתחות מוטורית', 'Motor Coordination & Development', 'קשיי קואורדינציה והתפתחות מוטורית.'),
  (27, 'language_communication', 'שפה ותקשורת', 'Language & Communication', 'קשיים בהתפתחות, הבנה או הבעה של שפה ותקשורת.'),
  (28, 'speech_articulation', 'דיבור והיגוי', 'Speech & Articulation', 'קשיים בדיבור, היגוי ובהפקה ברורה של צלילי דיבור.'),
  (29, 'fluency_stuttering', 'שטף דיבור וגמגום', 'Speech Fluency & Stuttering', 'גמגום וקשיים בשטף הדיבור.'),
  (30, 'voice', 'קול', 'Voice', 'קשיים והפרעות הקשורים לקול ולהפקת קול.'),
  (31, 'hearing_auditory_rehabilitation', 'שמיעה ושיקום שמיעתי', 'Hearing & Auditory Rehabilitation', 'קשיי שמיעה, שיקום שמיעתי ואימון שמיעתי.'),
  (32, 'swallowing_feeding', 'בליעה, לעיסה ואכילה תפקודית', 'Swallowing, Chewing & Functional Feeding', 'קשיים בבליעה, לעיסה ואכילה תפקודית.'),
  (33, 'performance_functioning', 'תפקוד בעבודה ובלימודים', 'Work & Study Functioning', 'קשיים בתפקוד בעבודה או בלימודים, ארגון, התמדה וביצוע משימות.'),
  (34, 'burnout', 'שחיקה ולחץ תעסוקתי', 'Burnout & Occupational Stress', 'שחיקה ולחץ הקשורים לעבודה, לעומס תעסוקתי ולאיזון בין עבודה לחיים.'),
  (35, 'career_direction', 'בחירת קריירה ושינוי מקצועי', 'Career Choice & Change', 'בחירת קריירה, שינוי מקצועי, התלבטות תעסוקתית וכיוון מקצועי.'),
  (36, 'eating_disorders', 'הפרעות אכילה', 'Eating Disorders', 'הפרעות אכילה כגון אנורקסיה, בולימיה ואכילה בולמוסית במסגרת טיפול מתאימה.'),
  (37, 'body_image', 'דימוי גוף', 'Body Image', 'דימוי גוף, יחס לגוף וקושי מתמשך ביחס למראה או למשקל.'),
  (38, 'nutrition_eating_habits', 'תזונה והרגלי אכילה', 'Nutrition & Eating Habits', 'תזונה, הרגלי אכילה ושינוי דפוסי אכילה.'),
  (39, 'medical_nutrition', 'תזונה במצבים רפואיים', 'Medical Nutrition', 'התאמת תזונה כחלק מהתמודדות עם מצב רפואי במסגרת המקצועית המתאימה.'),
  (40, 'sleep_difficulties', 'קשיי שינה', 'Sleep Difficulties', 'קשיי הירדמות, יקיצות, שינה לא רציפה וקשיי שינה נוספים.'),
  (41, 'musculoskeletal_pain', 'כאב וקשיי שריר־שלד', 'Musculoskeletal Pain & Difficulties', 'כאבים וקשיים במערכת השריר והשלד, כגון גב, צוואר, מפרקים וגפיים.'),
  (42, 'chronic_pain', 'כאב כרוני', 'Chronic Pain', 'כאב מתמשך או כרוני והשפעתו על התפקוד ואיכות החיים.'),
  (43, 'orthopedic_rehabilitation', 'שיקום אורתופדי ולאחר פציעה או ניתוח', 'Orthopedic & Post-Injury Rehabilitation', 'שיקום אורתופדי לאחר פציעה, שבר או ניתוח וחזרה הדרגתית לתפקוד.'),
  (44, 'neurological_rehabilitation', 'שיקום נוירולוגי', 'Neurological Rehabilitation', 'שיקום תפקודי בעקבות פגיעה או מצב נוירולוגי במסגרת המקצועית המתאימה.'),
  (45, 'mobility_balance', 'ניידות, שיווי משקל, סחרחורת ומניעת נפילות', 'Mobility, Balance, Dizziness & Fall Prevention', 'קשיי ניידות ושיווי משקל, סחרחורת ומניעת נפילות במסגרת המקצועית המתאימה.'),
  (46, 'pelvic_floor', 'רצפת אגן', 'Pelvic Floor', 'הערכה, טיפול ושיקום תפקודי הקשורים לרצפת האגן במסגרת המקצועית המתאימה.'),
  (47, 'cardiopulmonary_rehabilitation', 'שיקום לב־ריאה ונשימה', 'Cardiopulmonary & Respiratory Rehabilitation', 'שיקום לבבי, ריאתי ונשימתי במסגרת המקצועית המתאימה.'),
  (48, 'sports_rehabilitation', 'פציעות ספורט וחזרה לפעילות', 'Sports Injuries & Return to Activity', 'שיקום מפציעות ספורט וחזרה בטוחה והדרגתית לפעילות.'),
  (49, 'daily_functioning', 'תפקוד יומיומי ועצמאות', 'Daily Functioning & Independence', 'קשיים בפעילויות היומיום, עצמאות והתארגנות לתפקוד שוטף.'),
  (50, 'cognitive_rehabilitation', 'שיקום קוגניטיבי', 'Cognitive Rehabilitation', 'שיקום יכולות קוגניטיביות שנפגעו והשבת תפקוד במסגרת המקצועית המתאימה.'),
  (51, 'fine_motor_graphomotor', 'מוטוריקה עדינה וגרפומוטוריקה', 'Fine Motor & Graphomotor Skills', 'קשיים במוטוריקה עדינה, כתיבה וגרפומוטוריקה.'),
  (52, 'cognitive_decline_dementia', 'ירידה קוגניטיבית ודמנציה', 'Cognitive Decline & Dementia', 'ירידה קוגניטיבית, דמנציה והתאמות תפקודיות הנלוות להן.'),
  (53, 'pregnancy_birth_postpartum', 'היריון, לידה ומשכב לידה', 'Pregnancy, Birth & Postpartum', 'ליווי וטיפול בצרכים הקשורים להיריון, לידה והתקופה שלאחר הלידה במסגרת המקצועית המתאימה.'),
  (54, 'breastfeeding_lactation', 'הנקה', 'Breastfeeding & Lactation', 'ליווי, הדרכה וסיוע בקשיי הנקה במסגרת המקצועית המתאימה.'),
  (55, 'fertility_journey', 'ליווי סביב פוריות', 'Fertility Journey Support', 'ליווי רגשי או מקצועי סביב טיפולי פוריות ומסע הפוריות, ללא טענה לטיפול רפואי באי־פוריות.'),
  (56, 'addiction', 'התמכרויות ותלות', 'Addiction & Dependency', 'התמכרות או תלות כאשר אין די מידע להבחין בין התמכרות לחומרים לבין התמכרות התנהגותית.'),
  (57, 'substance_use', 'שימוש בחומרים והתמכרויות לחומרים', 'Substance Use & Substance Addictions', 'שימוש בעייתי או התמכרות לאלכוהול, סמים, קנאביס, ניקוטין וחומרים אחרים.'),
  (58, 'behavioral_addiction', 'התמכרויות התנהגותיות', 'Behavioral Addictions', 'התמכרויות התנהגותיות כגון הימורים, מסכים והתנהגויות ממכרות אחרות.'),
  (59, 'somatic', 'תסמינים פסיכוסומטיים וקשר גוף־נפש', 'Psychosomatic Symptoms & Mind-Body Connection', 'תסמינים גופניים המושפעים מגורמים רגשיים והתמודדות עם הקשר בין גוף לנפש.'),
  (60, 'chronic_illness_adjustment', 'התמודדות עם מחלה כרונית או מצב רפואי', 'Chronic Illness & Medical Condition Adjustment', 'הסתגלות רגשית ותפקודית לחיים עם מחלה כרונית או מצב רפואי מתמשך.'),
  (61, 'medical_rehabilitation', 'שיקום לאחר מחלה, אשפוז או ניתוח', 'Medical Rehabilitation', 'שיקום וחזרה לתפקוד לאחר מחלה, אשפוז או ניתוח במסגרת המקצועית המתאימה.'),
  (62, 'disability_adjustment', 'הסתגלות למוגבלות ולשינוי תפקודי', 'Disability & Functional Change Adjustment', 'הסתגלות למוגבלות, לאובדן יכולת או לשינוי משמעותי בתפקוד.');

create temporary table _expected_existing_problem_slugs (
  slug text primary key
) on commit drop;

insert into _expected_existing_problem_slugs (slug)
values
  ('anxiety'),
  ('depression'),
  ('trauma'),
  ('relationships'),
  ('family_parenting'),
  ('social_belonging'),
  ('self_identity'),
  ('emotional_regulation'),
  ('ocd_compulsions'),
  ('addiction'),
  ('eating_body'),
  ('sexuality_intimacy'),
  ('grief_loss'),
  ('life_transitions'),
  ('performance_functioning'),
  ('communication_expression'),
  ('developmental'),
  ('neurodiversity'),
  ('somatic'),
  ('existential'),
  ('generalized_anxiety'),
  ('panic'),
  ('social_anxiety'),
  ('health_anxiety'),
  ('performance_anxiety'),
  ('low_mood'),
  ('anhedonia'),
  ('burnout_depression'),
  ('ptsd'),
  ('complex_trauma'),
  ('childhood_trauma'),
  ('acute_crisis'),
  ('couples_conflict'),
  ('breakup'),
  ('divorce'),
  ('trust_issues'),
  ('attachment_issues'),
  ('parent_child_conflict'),
  ('parenting_stress'),
  ('loneliness'),
  ('social_isolation'),
  ('low_self_esteem'),
  ('identity_crisis'),
  ('anger'),
  ('emotional_overwhelm'),
  ('intrusive_thoughts'),
  ('compulsions'),
  ('substance_use'),
  ('behavioral_addiction'),
  ('binge_eating'),
  ('body_image'),
  ('sexual_dysfunction'),
  ('intimacy_issues'),
  ('bereavement'),
  ('loss'),
  ('career_change'),
  ('major_life_change'),
  ('burnout'),
  ('procrastination'),
  ('communication_difficulties'),
  ('childhood_development'),
  ('adhd'),
  ('autism'),
  ('psychosomatic'),
  ('existential_anxiety'),
  ('meaning_crisis'),
  ('personality_disorders'),
  ('sexual_abuse_trauma'),
  ('sleep_difficulties'),
  ('violence_abuse');

-- ---------------------------------------------------------------------------
-- PREFLIGHT
-- The snapshot contained 70 existing slugs. They must still exist.
-- New canonical slugs may already exist if this migration is being rerun.
-- Any OTHER unexpected slug aborts the migration instead of silently disabling it.
-- ---------------------------------------------------------------------------
do $$
declare
  missing_slugs text;
  unexpected_slugs text;
begin
  select string_agg(e.slug, ', ' order by e.slug)
    into missing_slugs
  from _expected_existing_problem_slugs e
  left join public.problems p on p.slug = e.slug
  where p.id is null;

  if missing_slugs is not null then
    raise exception
      'Migration aborted: expected existing problem slugs are missing: %',
      missing_slugs;
  end if;

  select string_agg(p.slug, ', ' order by p.slug)
    into unexpected_slugs
  from public.problems p
  where not exists (
          select 1
          from _expected_existing_problem_slugs e
          where e.slug = p.slug
        )
    and not exists (
          select 1
          from _canonical_problems c
          where c.slug = p.slug
        );

  if unexpected_slugs is not null then
    raise exception
      'Migration aborted: unexpected problem slugs found: %',
      unexpected_slugs;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- UPSERT ALL 62 CANONICAL DOMAINS
-- Existing rows keep their IDs.
-- 34 missing slugs are inserted.
-- The 7 reactivated slugs become active again.
-- All canonical domains are top-level: parent_id = NULL.
-- ---------------------------------------------------------------------------
insert into public.problems (
  slug,
  name_he,
  name_en,
  description,
  parent_id,
  is_active,
  sort_order,
  updated_at
)
select
  c.slug,
  c.name_he,
  c.name_en,
  c.description,
  null::bigint,
  true,
  c.sort_order,
  now()
from _canonical_problems c
on conflict (slug) do update
set
  name_he = excluded.name_he,
  name_en = excluded.name_en,
  description = excluded.description,
  parent_id = null,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- DEACTIVATE EVERYTHING THAT IS NOT ONE OF THE 62 CANONICAL DOMAINS.
-- This includes the 3 Legacy slugs:
--   eating_body, developmental, neurodiversity
-- and all deprecated subdomain slugs.
-- Rows are preserved for backward compatibility; IDs are NOT deleted.
-- ---------------------------------------------------------------------------
update public.problems p
set
  is_active = false,
  sort_order = 0,
  updated_at = now()
where not exists (
  select 1
  from _canonical_problems c
  where c.slug = p.slug
)
and (
  p.is_active is distinct from false
  or p.sort_order <> 0
);

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VALIDATION
-- Any failure raises an exception and rolls the whole transaction back.
-- ---------------------------------------------------------------------------
do $$
declare
  active_count integer;
  canonical_count integer;
  new_total_count integer;
  active_with_parent integer;
  bad_sort_count integer;
  duplicate_sort_count integer;
  active_noncanonical text;
  missing_canonical text;
  legacy_active text;
begin
  select count(*)
    into active_count
  from public.problems
  where is_active = true;

  if active_count <> 62 then
    raise exception
      'Validation failed: expected 62 active problems, found %',
      active_count;
  end if;

  select count(*)
    into canonical_count
  from public.problems p
  join _canonical_problems c on c.slug = p.slug
  where p.is_active = true;

  if canonical_count <> 62 then
    raise exception
      'Validation failed: expected all 62 canonical slugs to be active, found %',
      canonical_count;
  end if;

  select count(*)
    into new_total_count
  from public.problems;

  if new_total_count <> 104 then
    raise exception
      'Validation failed: expected 104 total preserved+new problem rows, found %',
      new_total_count;
  end if;

  select count(*)
    into active_with_parent
  from public.problems
  where is_active = true
    and parent_id is not null;

  if active_with_parent <> 0 then
    raise exception
      'Validation failed: % active canonical problems still have parent_id',
      active_with_parent;
  end if;

  select count(*)
    into bad_sort_count
  from public.problems
  where is_active = true
    and (sort_order < 1 or sort_order > 62);

  if bad_sort_count <> 0 then
    raise exception
      'Validation failed: % active problems have sort_order outside 1..62',
      bad_sort_count;
  end if;

  select count(*)
    into duplicate_sort_count
  from (
    select sort_order
    from public.problems
    where is_active = true
    group by sort_order
    having count(*) > 1
  ) d;

  if duplicate_sort_count <> 0 then
    raise exception
      'Validation failed: duplicate active sort_order values detected';
  end if;

  select string_agg(p.slug, ', ' order by p.slug)
    into active_noncanonical
  from public.problems p
  where p.is_active = true
    and not exists (
      select 1 from _canonical_problems c where c.slug = p.slug
    );

  if active_noncanonical is not null then
    raise exception
      'Validation failed: noncanonical slugs are active: %',
      active_noncanonical;
  end if;

  select string_agg(c.slug, ', ' order by c.sort_order)
    into missing_canonical
  from _canonical_problems c
  left join public.problems p
    on p.slug = c.slug
   and p.is_active = true
  where p.id is null;

  if missing_canonical is not null then
    raise exception
      'Validation failed: canonical slugs missing/inactive: %',
      missing_canonical;
  end if;

  select string_agg(p.slug, ', ' order by p.slug)
    into legacy_active
  from public.problems p
  where p.slug in ('eating_body', 'developmental', 'neurodiversity')
    and p.is_active = true;

  if legacy_active is not null then
    raise exception
      'Validation failed: Legacy slugs are still active: %',
      legacy_active;
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- READ-ONLY REPORT AFTER SUCCESS
-- Expected:
--   total_rows = 104
--   active_rows = 62
--   inactive_rows = 42
--   active_with_parent = 0
--   active_sort_min = 1
--   active_sort_max = 62
--   active_distinct_sort_orders = 62
-- ---------------------------------------------------------------------------
select
  count(*) as total_rows,
  count(*) filter (where is_active) as active_rows,
  count(*) filter (where not is_active) as inactive_rows,
  count(*) filter (where is_active and parent_id is not null) as active_with_parent,
  min(sort_order) filter (where is_active) as active_sort_min,
  max(sort_order) filter (where is_active) as active_sort_max,
  count(distinct sort_order) filter (where is_active) as active_distinct_sort_orders
from public.problems;

-- Optional human-readable verification of the final active catalog:
select
  id,
  sort_order,
  slug,
  name_he,
  name_en,
  parent_id,
  is_active
from public.problems
where is_active = true
order by sort_order;

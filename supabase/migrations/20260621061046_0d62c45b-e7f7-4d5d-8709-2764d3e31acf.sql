
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.problems(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.problem_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  alias text NOT NULL
);
CREATE INDEX idx_problem_aliases_alias ON public.problem_aliases USING gin (alias gin_trgm_ops);

CREATE TABLE public.problem_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  intent_text text NOT NULL
);
CREATE INDEX idx_problem_intents_text ON public.problem_intents USING gin (intent_text gin_trgm_ops);

CREATE TABLE public.languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL
);

CREATE TABLE public.population_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE public.therapists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  full_name text NOT NULL,
  professional_title text NOT NULL,
  short_intro text,
  full_description text,
  years_experience int NOT NULL DEFAULT 0,
  city text NOT NULL,
  region text,
  country text NOT NULL DEFAULT 'Israel',
  latitude numeric,
  longitude numeric,
  image_url text,
  license_number text UNIQUE,
  phone text,
  verified boolean NOT NULL DEFAULT false,
  profile_claimed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_therapists_city ON public.therapists(city);

CREATE TABLE public.therapist_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  population_id uuid REFERENCES public.population_groups(id) ON DELETE SET NULL,
  UNIQUE(therapist_id, problem_id, population_id)
);
CREATE INDEX idx_tp_problem ON public.therapist_problems(problem_id);
CREATE INDEX idx_tp_therapist ON public.therapist_problems(therapist_id);

CREATE TABLE public.therapist_languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  language_id uuid NOT NULL REFERENCES public.languages(id) ON DELETE CASCADE,
  UNIQUE(therapist_id, language_id)
);

CREATE TABLE public.therapist_populations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  population_id uuid NOT NULL REFERENCES public.population_groups(id) ON DELETE CASCADE,
  UNIQUE(therapist_id, population_id)
);

CREATE TABLE public.cta_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id uuid NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  ip_hash text,
  user_agent text,
  source_problem_id uuid REFERENCES public.problems(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cta_session_therapist ON public.cta_clicks(therapist_id, session_id, created_at DESC);

GRANT SELECT ON public.problems TO anon, authenticated;
GRANT ALL ON public.problems TO service_role;
GRANT SELECT ON public.problem_aliases TO anon, authenticated;
GRANT ALL ON public.problem_aliases TO service_role;
GRANT SELECT ON public.problem_intents TO anon, authenticated;
GRANT ALL ON public.problem_intents TO service_role;
GRANT SELECT ON public.languages TO anon, authenticated;
GRANT ALL ON public.languages TO service_role;
GRANT SELECT ON public.population_groups TO anon, authenticated;
GRANT ALL ON public.population_groups TO service_role;
GRANT SELECT ON public.therapists TO anon, authenticated;
GRANT ALL ON public.therapists TO service_role;
GRANT SELECT ON public.therapist_problems TO anon, authenticated;
GRANT ALL ON public.therapist_problems TO service_role;
GRANT SELECT ON public.therapist_languages TO anon, authenticated;
GRANT ALL ON public.therapist_languages TO service_role;
GRANT SELECT ON public.therapist_populations TO anon, authenticated;
GRANT ALL ON public.therapist_populations TO service_role;
GRANT ALL ON public.cta_clicks TO service_role;

ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read problems" ON public.problems FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.problem_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read aliases" ON public.problem_aliases FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.problem_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read intents" ON public.problem_intents FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read languages" ON public.languages FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.population_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read populations" ON public.population_groups FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapists" ON public.therapists FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.therapist_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_problems" ON public.therapist_problems FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.therapist_languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_languages" ON public.therapist_languages FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.therapist_populations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read therapist_populations" ON public.therapist_populations FOR SELECT TO anon, authenticated USING (true);
ALTER TABLE public.cta_clicks ENABLE ROW LEVEL SECURITY;

WITH parent AS (
  INSERT INTO public.problems (name, slug, description)
  VALUES ('חרדה', 'anxiety', 'קטגוריית-על לכל סוגי החרדה: התקפי חרדה, חרדה חברתית, פוביות, דאגנות יתר, חרדת בריאות ועוד.')
  RETURNING id
)
INSERT INTO public.problems (name, slug, parent_id, description)
SELECT v.name, v.slug, parent.id, v.description FROM parent,
(VALUES
  ('חרדה כללית (GAD)', 'generalized-anxiety', 'דאגנות יתר מתמשכת לגבי מגוון תחומים בחיים, מתח שרירי ותחושת חוסר שקט.'),
  ('הפרעת פאניקה', 'panic-disorder', 'התקפי חרדה פתאומיים עם תחושות גופניות עוצמתיות וחשש מהתקף הבא.'),
  ('חרדה חברתית', 'social-anxiety', 'פחד עז ממצבים חברתיים, מהערכת אחרים ומחשיפה פומבית.'),
  ('פוביות ספציפיות', 'specific-phobias', 'פחד עז ולא פרופורציונלי ממצב או אובייקט מסוים (טיסה, נהיגה, מחטים ועוד).'),
  ('חרדת בריאות', 'health-anxiety', 'דאגה חוזרת ומתישה לגבי מחלות גופניות וסימפטומים.'),
  ('חרדת פרידה', 'separation-anxiety', 'מצוקה משמעותית סביב פרידה מדמויות התקשרות משמעותיות.'),
  ('חרדת ביצוע', 'performance-anxiety', 'חרדה לפני ובמהלך הופעות, מבחנים, ראיונות או משימות תחת לחץ.'),
  ('חרדה בזוגיות', 'relationship-anxiety', 'דאגנות, ספקות וקושי באינטימיות בתוך מערכות יחסים זוגיות.'),
  ('חרדת עבודה ושחיקה', 'work-anxiety', 'לחץ מתמשך, פחד מכישלון בעבודה ושחיקה רגשית.')
) AS v(name, slug, description);

INSERT INTO public.problem_aliases (problem_id, alias)
SELECT p.id, a.alias FROM public.problems p JOIN (VALUES
  ('generalized-anxiety','דאגנות יתר'),('generalized-anxiety','מחשבות טורדניות'),('generalized-anxiety','חרדה כללית'),('generalized-anxiety','דואג כל הזמן'),
  ('panic-disorder','התקף חרדה'),('panic-disorder','התקפי פאניקה'),('panic-disorder','דפיקות לב'),('panic-disorder','קוצר נשימה'),
  ('social-anxiety','פחד חברתי'),('social-anxiety','ביישנות קיצונית'),('social-anxiety','חרדה במסיבות'),
  ('specific-phobias','פחד מטיסה'),('specific-phobias','פחד מנהיגה'),('specific-phobias','פחד ממחטים'),('specific-phobias','פוביה'),
  ('health-anxiety','היפוכונדריה'),('health-anxiety','פחד ממחלות'),
  ('separation-anxiety','חרדת פרידה'),('separation-anxiety','קושי בפרידה'),
  ('performance-anxiety','חרדת מבחנים'),('performance-anxiety','חרדת במה'),
  ('relationship-anxiety','חרדה בזוגיות'),('relationship-anxiety','קושי באינטימיות'),
  ('work-anxiety','שחיקה'),('work-anxiety','בורנאאוט'),('work-anxiety','לחץ בעבודה'),
  ('anxiety','חרדות')
) AS a(slug, alias) ON p.slug = a.slug;

INSERT INTO public.problem_intents (problem_id, intent_text)
SELECT p.id, i.intent FROM public.problems p JOIN (VALUES
  ('generalized-anxiety','אני חושב יותר מדי על הכל'),
  ('generalized-anxiety','דואג כל הזמן ולא נרגע'),
  ('generalized-anxiety','מחשבות שלא נגמרות בלילה'),
  ('panic-disorder','התקפי פאניקה פתאומיים'),
  ('panic-disorder','פאניקה לפני עבודה'),
  ('panic-disorder','דפיקות לב מהירות ופחד שאני עומד למות'),
  ('social-anxiety','חרדה במפגשים חברתיים'),
  ('social-anxiety','קשה לי לדבר בקבוצה'),
  ('social-anxiety','אני פוחד שיסתכלו עליי'),
  ('specific-phobias','פחד מטיסה'),
  ('specific-phobias','פחד מנהיגה בכביש מהיר'),
  ('specific-phobias','פחד ממעליות'),
  ('health-anxiety','אני בטוח שיש לי מחלה רצינית'),
  ('health-anxiety','בודק את הגוף שלי כל הזמן'),
  ('separation-anxiety','קשה לי להיפרד מבן או בת הזוג'),
  ('separation-anxiety','הילד שלי לא מסוגל להיפרד'),
  ('performance-anxiety','חרדת מבחנים'),
  ('performance-anxiety','קופא לפני מצגות'),
  ('performance-anxiety','חרדת ראיונות עבודה'),
  ('relationship-anxiety','כל הזמן בודק אם הקשר טוב'),
  ('relationship-anxiety','חרדה מנטישה בזוגיות'),
  ('work-anxiety','שחיקה בעבודה'),
  ('work-anxiety','חרדה מללכת לעבודה בבוקר'),
  ('work-anxiety','לחץ מתמיד מהבוס')
) AS i(slug, intent) ON p.slug = i.slug;

INSERT INTO public.languages (code, name) VALUES
  ('he','עברית'),('en','אנגלית'),('ar','ערבית'),('ru','רוסית'),('fr','צרפתית');

INSERT INTO public.population_groups (slug, name, sort_order) VALUES
  ('toddlers','פעוטות',1),('children','ילדים',2),('teens','נוער',3),('adults','מבוגרים',4),('elderly','קשישים',5);

INSERT INTO public.therapists (slug, full_name, professional_title, short_intro, full_description, years_experience, city, region, image_url, license_number, phone, verified) VALUES
('dana-levi','ד״ר דנה לוי','פסיכולוגית קלינית מומחית','מטפלת CBT עם 14 שנות ניסיון בטיפול בהתקפי חרדה ופוביות.','ד״ר דנה לוי היא פסיכולוגית קלינית מומחית, מתמחה בטיפול קוגניטיבי-התנהגותי (CBT) ובטיפול ממוקד חשיפה. עובדת עם מבוגרים ונוער המתמודדים עם פאניקה, פוביות ספציפיות וחרדה חברתית.',14,'תל אביב','מרכז','https://i.pravatar.cc/300?img=47','27-001','03-5550111',true),
('yossi-cohen','יוסי כהן','עובד סוציאלי קליני','טיפול דינמי וקוגניטיבי בחרדות, התקפי פאניקה ושחיקה.','יוסי כהן הוא עובד סוציאלי קליני (MSW) עם 9 שנות ניסיון. משלב גישה דינמית עם כלים מעשיים להתמודדות עם חרדה ושחיקה במקום העבודה.',9,'תל אביב','מרכז','https://i.pravatar.cc/300?img=12','27-002','03-5550112',true),
('michal-shapira','מיכל שפירא','פסיכותרפיסטית','מומחית בחרדה חברתית, ביישנות וחרדת ביצוע אצל מבוגרים צעירים.','מיכל שפירא, פסיכותרפיסטית בגישה אינטגרטיבית, מלווה מבוגרים צעירים בהתמודדות עם חרדה חברתית, חרדת ראיונות ופחד מהערכה.',7,'תל אביב','מרכז','https://i.pravatar.cc/300?img=32','27-003','03-5550113',true),
('avi-friedman','ד״ר אבי פרידמן','פסיכיאטר ופסיכותרפיסט','שילוב טיפול תרופתי וטיפול CBT בהפרעות חרדה.','ד״ר אבי פרידמן, פסיכיאטר בכיר עם 22 שנות ניסיון, מתמחה בהפרעות חרדה מורכבות, התקפי פאניקה וחרדת בריאות.',22,'ירושלים','ירושלים','https://i.pravatar.cc/300?img=68','27-004','02-5550114',true),
('noa-bar','נועה בר','פסיכולוגית התפתחותית','מומחית בחרדת פרידה אצל ילדים ופעוטות.','נועה בר היא פסיכולוגית התפתחותית, עובדת עם משפחות וילדים בגילאי 2-12 סביב חרדת פרידה, חרדה כללית וחרדת ביצוע בבית הספר.',11,'ירושלים','ירושלים','https://i.pravatar.cc/300?img=45','27-005','02-5550115',true),
('rami-azulay','רמי אזולאי','עובד סוציאלי קליני','טיפול בחרדה ובשחיקה תעסוקתית בקרב אנשי הייטק.','רמי אזולאי, MSW, מטפל בעיקר באנשי הייטק וניהול בכיר עם שחיקה, חרדת עבודה והתקפי פאניקה.',12,'חיפה','צפון','https://i.pravatar.cc/300?img=14','27-006','04-5550116',true),
('sarah-mizrahi','שרה מזרחי','פסיכולוגית קלינית','טיפול בחרדה בזוגיות וחרדת נטישה.','שרה מזרחי, פסיכולוגית קלינית, מתמחה בטיפול בזוגות ויחידים סביב חרדה בזוגיות, קושי באינטימיות וחרדת נטישה.',16,'חיפה','צפון','https://i.pravatar.cc/300?img=49','27-007','04-5550117',true),
('eli-katz','אלי כץ','פסיכותרפיסט CBT','מומחה בפוביות ספציפיות, פחד מטיסה ופחד מנהיגה.','אלי כץ הוא פסיכותרפיסט CBT המתמחה בטיפול חשיפתי לפוביות ספציפיות, כולל פחד מטיסה, נהיגה, מעליות ומחטים.',8,'תל אביב','מרכז','https://i.pravatar.cc/300?img=15','27-008','03-5550118',true),
('lior-amir','ליאור אמיר','פסיכולוגית חינוכית','חרדת מבחנים וחרדת ביצוע אצל נוער וצעירים.','ליאור אמיר, פסיכולוגית חינוכית, מלווה תלמידי תיכון וסטודנטים סביב חרדת מבחנים, חרדת ביצוע וחרדה כללית.',10,'באר שבע','דרום','https://i.pravatar.cc/300?img=20','27-009','08-5550119',true),
('tamar-golan','תמר גולן','פסיכולוגית קלינית','חרדת בריאות, היפוכונדריה ודאגנות יתר.','תמר גולן, פסיכולוגית קלינית, מתמחה בטיפול בחרדת בריאות, היפוכונדריה ומחשבות טורדניות סביב הגוף.',13,'ירושלים','ירושלים','https://i.pravatar.cc/300?img=44','27-010','02-5550120',true),
('moshe-ben-david','משה בן דוד','פסיכותרפיסט בגישה דינמית','חרדות אצל מבוגרים וקשישים.','משה בן דוד מטפל בגישה דינמית במבוגרים וקשישים סביב חרדה כללית, חרדת בריאות וחרדת פרידה.',25,'רמת גן','מרכז','https://i.pravatar.cc/300?img=33','27-011','03-5550121',true),
('rina-shemesh','רינה שמש','עובדת סוציאלית קלינית','חרדה חברתית וחרדת ביצוע אצל מבוגרים צעירים.','רינה שמש, MSW קלינית, עובדת עם מבוגרים צעירים סביב חרדה חברתית, ראיונות עבודה והתחלת קריירה.',6,'תל אביב','מרכז','https://i.pravatar.cc/300?img=26','27-012','03-5550122',true);

INSERT INTO public.therapist_problems (therapist_id, problem_id)
SELECT t.id, p.id FROM public.therapists t JOIN (VALUES
  ('dana-levi','panic-disorder'),('dana-levi','specific-phobias'),('dana-levi','social-anxiety'),('dana-levi','anxiety'),
  ('yossi-cohen','panic-disorder'),('yossi-cohen','work-anxiety'),('yossi-cohen','generalized-anxiety'),('yossi-cohen','anxiety'),
  ('michal-shapira','social-anxiety'),('michal-shapira','performance-anxiety'),('michal-shapira','anxiety'),
  ('avi-friedman','panic-disorder'),('avi-friedman','health-anxiety'),('avi-friedman','generalized-anxiety'),('avi-friedman','anxiety'),
  ('noa-bar','separation-anxiety'),('noa-bar','performance-anxiety'),('noa-bar','generalized-anxiety'),('noa-bar','anxiety'),
  ('rami-azulay','work-anxiety'),('rami-azulay','panic-disorder'),('rami-azulay','anxiety'),
  ('sarah-mizrahi','relationship-anxiety'),('sarah-mizrahi','generalized-anxiety'),('sarah-mizrahi','anxiety'),
  ('eli-katz','specific-phobias'),('eli-katz','panic-disorder'),('eli-katz','anxiety'),
  ('lior-amir','performance-anxiety'),('lior-amir','generalized-anxiety'),('lior-amir','anxiety'),
  ('tamar-golan','health-anxiety'),('tamar-golan','generalized-anxiety'),('tamar-golan','anxiety'),
  ('moshe-ben-david','generalized-anxiety'),('moshe-ben-david','health-anxiety'),('moshe-ben-david','separation-anxiety'),('moshe-ben-david','anxiety'),
  ('rina-shemesh','social-anxiety'),('rina-shemesh','performance-anxiety'),('rina-shemesh','anxiety')
) AS x(tslug, pslug) ON t.slug = x.tslug
JOIN public.problems p ON p.slug = x.pslug;

INSERT INTO public.therapist_populations (therapist_id, population_id)
SELECT t.id, pg.id FROM public.therapists t JOIN (VALUES
  ('dana-levi','adults'),('dana-levi','teens'),
  ('yossi-cohen','adults'),
  ('michal-shapira','adults'),('michal-shapira','teens'),
  ('avi-friedman','adults'),('avi-friedman','elderly'),
  ('noa-bar','toddlers'),('noa-bar','children'),
  ('rami-azulay','adults'),
  ('sarah-mizrahi','adults'),
  ('eli-katz','adults'),('eli-katz','teens'),
  ('lior-amir','teens'),('lior-amir','adults'),
  ('tamar-golan','adults'),('tamar-golan','elderly'),
  ('moshe-ben-david','adults'),('moshe-ben-david','elderly'),
  ('rina-shemesh','adults')
) AS x(tslug, popslug) ON t.slug = x.tslug
JOIN public.population_groups pg ON pg.slug = x.popslug;

INSERT INTO public.therapist_languages (therapist_id, language_id)
SELECT t.id, l.id FROM public.therapists t JOIN (VALUES
  ('dana-levi','he'),('dana-levi','en'),
  ('yossi-cohen','he'),
  ('michal-shapira','he'),('michal-shapira','en'),
  ('avi-friedman','he'),('avi-friedman','en'),('avi-friedman','ru'),
  ('noa-bar','he'),
  ('rami-azulay','he'),('rami-azulay','en'),
  ('sarah-mizrahi','he'),('sarah-mizrahi','ar'),
  ('eli-katz','he'),('eli-katz','en'),
  ('lior-amir','he'),
  ('tamar-golan','he'),('tamar-golan','en'),
  ('moshe-ben-david','he'),('moshe-ben-david','ru'),
  ('rina-shemesh','he'),('rina-shemesh','en')
) AS x(tslug, lcode) ON t.slug = x.tslug
JOIN public.languages l ON l.code = x.lcode;

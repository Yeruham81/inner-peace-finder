-- Tipulinks — Migration 2: canonical problem aliases
-- Prerequisite: Migration 1 completed successfully.
-- Expected database state before first run:
--   public.problems: 104 total / 62 active
--   public.problem_aliases: 500 rows
--
-- Target state:
--   public.problem_aliases: 483 rows
--   483 distinct aliases
--   aliases point only to the 62 active canonical treatment domains
--   UNIQUE(alias) enforced
--
-- IMPORTANT:
-- This migration intentionally rebuilds problem_aliases.
-- problem_aliases IDs are not preserved because no foreign key references
-- public.problem_aliases(id). The whole operation is transactional.

begin;

select pg_advisory_xact_lock(hashtext('tipulinks_problem_aliases_catalog_v1'));

-- ---------------------------------------------------------------------------
-- AUTHORITATIVE FINAL ALIAS SET
-- ---------------------------------------------------------------------------
create temporary table _final_problem_aliases (
  alias text primary key,
  target_slug text not null
) on commit drop;

insert into _final_problem_aliases (alias, target_slug)
values
  ('אני חרד', 'anxiety'),
  ('אני מפחד כל הזמן', 'anxiety'),
  ('אני נמנע מדברים בגלל פחד', 'anxiety'),
  ('אני בדיכאון', 'depression'),
  ('אני לא נהנה מכלום', 'depression'),
  ('כלום לא מעניין אותי', 'depression'),
  ('יש לי בעיות בזוגיות', 'relationships'),
  ('קשה לי במערכות יחסים', 'relationships'),
  ('אני מפחד להיקשר', 'relationships'),
  ('קשה לי לסמוך על אנשים', 'relationships'),
  ('אני מתמודד עם אובדן', 'grief_loss'),
  ('איבדתי מישהו קרוב', 'grief_loss'),
  ('אני מתאבל', 'grief_loss'),
  ('משהו בי נשבר מאז שאיבדתי מישהו', 'grief_loss'),
  ('אני בתקופה של שינוי גדול', 'life_transitions'),
  ('עברתי שינוי בחיים ואני לא מסתדר', 'life_transitions'),
  ('אני לא מוצא את עצמי אחרי מעבר', 'life_transitions'),
  ('קשה לי להסתגל למצב חדש', 'life_transitions'),
  ('אני בין שלבים בחיים ולא יציב', 'life_transitions'),
  ('יש לי ADHD', 'adhd'),
  ('יש לי מחשבות טורדניות', 'ocd_compulsions'),
  ('אני חייב לעשות דברים שוב ושוב', 'ocd_compulsions'),
  ('יש לי טקסים שאני חייב לבצע', 'ocd_compulsions'),
  ('אני בודק דברים כל הזמן', 'ocd_compulsions'),
  ('יש לי התמכרות', 'addiction'),
  ('קשה לי לשלוט בשימוש', 'addiction'),
  ('אני לא מרוצה מהגוף שלי', 'body_image'),
  ('קשה לי עם דימוי גוף', 'body_image'),
  ('אני מרגיש לא שייך', 'social_belonging'),
  ('קשה לי להתחבר לאנשים', 'social_belonging'),
  ('אני לבד חברתית', 'social_belonging'),
  ('אין לי חברים קרובים', 'social_belonging'),
  ('אני מחוץ לקבוצה', 'social_belonging'),
  ('אני לא מצליח להשתלב', 'social_belonging'),
  ('אני לא יודע מי אני', 'self_identity'),
  ('אני מבולבל לגבי עצמי', 'self_identity'),
  ('אני לא בטוח בזהות שלי', 'self_identity'),
  ('אין משמעות למה שאני עושה', 'existential'),
  ('אני לא מוצא משמעות', 'existential'),
  ('יש לי ADHD או חשד לזה', 'adhd'),
  ('התאבלות', 'grief_loss'),
  ('אבא שלי נפטר', 'grief_loss'),
  ('אמא שלי נפטרה', 'grief_loss'),
  ('אני מתאבלת', 'grief_loss'),
  ('קשה לי אחרי המוות', 'grief_loss'),
  ('בודד', 'social_belonging'),
  ('בודדה', 'social_belonging'),
  ('אני בודד', 'social_belonging'),
  ('אני בודדה', 'social_belonging'),
  ('אני מרגיש בודד', 'social_belonging'),
  ('אני מרגישה בודדה', 'social_belonging'),
  ('תחושת בדידות', 'social_belonging'),
  ('אין לי חברים', 'social_belonging'),
  ('אין לי עם מי לדבר', 'social_belonging'),
  ('פאניקה', 'anxiety'),
  ('אטאק', 'anxiety'),
  ('אטאקים', 'anxiety'),
  ('התקפי חרדה', 'anxiety'),
  ('התקף חרדה', 'anxiety'),
  ('פוסט-טראומה', 'trauma'),
  ('פלאשבק', 'trauma'),
  ('היפר עוררות', 'trauma'),
  ('טראמה', 'trauma'),
  ('טראומה', 'trauma'),
  ('טראומטי', 'trauma'),
  ('חוויה טראומטית', 'trauma'),
  ('שחיקה', 'burnout'),
  ('שחיקה מהעבודה', 'burnout'),
  ('אני שחוק', 'burnout'),
  ('אני שחוקה', 'burnout'),
  ('כועס', 'emotional_regulation'),
  ('כועסת', 'emotional_regulation'),
  ('אני כועס', 'emotional_regulation'),
  ('אני כועסת', 'emotional_regulation'),
  ('אני מתפרץ', 'emotional_regulation'),
  ('כעסים', 'emotional_regulation'),
  ('פחד חברתי', 'anxiety'),
  ('פחד מאנשים', 'anxiety'),
  ('פוחד ממצבים חברתיים', 'anxiety'),
  ('פוחדת מלדבר בפני קהל', 'anxiety'),
  ('בושה חברתית', 'anxiety'),
  ('חרדה מפני אנשים', 'anxiety'),
  ('אין לי ערך', 'self_identity'),
  ('אני לא שווה', 'self_identity'),
  ('כולם טובים ממני', 'self_identity'),
  ('אני שונאת את עצמי', 'self_identity'),
  ('אני לא סובלת את עצמי', 'self_identity'),
  ('אני שונא את עצמי', 'self_identity'),
  ('אני לא מאמין בעצמי', 'self_identity'),
  ('משבר בזוגיות', 'relationships'),
  ('מריבות בזוגיות', 'relationships'),
  ('לא מסתדרים בזוגיות', 'relationships'),
  ('לא מסתדרת עם בן הזוג', 'relationships'),
  ('לא מסתדר עם בת הזוג', 'relationships'),
  ('בגידה בזוגיות', 'relationships'),
  ('בגד בי', 'relationships'),
  ('בגדה בי', 'relationships'),
  ('כועסת על בן הזוג', 'relationships'),
  ('בעל שלי מוציא אותי מדעתי', 'relationships'),
  ('אני מוצף', 'emotional_regulation'),
  ('אני מוצפת', 'emotional_regulation'),
  ('בעיות אינטימיות', 'sexuality_intimacy'),
  ('קושי באינטימיות', 'sexuality_intimacy'),
  ('לא מצליח להיות אינטימי', 'sexuality_intimacy'),
  ('לא מצליחה להיות אינטימית', 'sexuality_intimacy'),
  ('דימוי גוף נמוך', 'body_image'),
  ('לא אוהבת את הגוף שלי', 'body_image'),
  ('לא אוהב את הגוף שלי', 'body_image'),
  ('שונא את הגוף שלי', 'body_image'),
  ('שונאת את הגוף שלי', 'body_image'),
  ('לחץ הורי', 'family_parenting'),
  ('שחיקת הורים', 'family_parenting'),
  ('קושי בהורות', 'family_parenting'),
  ('לא יודעת איך להתמודד עם הילדים', 'family_parenting'),
  ('לא יודע איך להתמודד עם הילדים', 'family_parenting'),
  ('מתקשה להורות', 'family_parenting'),
  ('אני מתפרצת על הילדים', 'family_parenting'),
  ('אני מתפרץ על הילדים', 'family_parenting'),
  ('אלכוהול', 'substance_use'),
  ('שתייה מופרזת', 'substance_use'),
  ('קנביס', 'substance_use'),
  ('אני שותה יותר מדי', 'substance_use'),
  ('אני משתמש בסמים', 'substance_use'),
  ('שימוש לרעה באלכוהול', 'substance_use'),
  ('התמכרות לאלכוהול', 'substance_use'),
  ('התמכרות לסמים', 'substance_use'),
  ('בדאון', 'depression'),
  ('אני בדאון', 'depression'),
  ('מצב רוח ירוד', 'depression'),
  ('אני בדאון רציני', 'depression'),
  ('אני בעצב', 'depression'),
  ('היפוכונדריה', 'anxiety'),
  ('מעבר בחיים', 'life_transitions'),
  ('שינוי גדול בחיים', 'life_transitions'),
  ('שינוי משמעותי', 'life_transitions'),
  ('נקודת מפנה', 'life_transitions'),
  ('לא יודעת מי אני', 'self_identity'),
  ('לא יודע מי אני', 'self_identity'),
  ('פסיכוסומטי', 'somatic'),
  ('כאבי בטן מלחץ', 'somatic'),
  ('כאב ראש מלחץ', 'somatic'),
  ('פגיעה בילדות', 'trauma'),
  ('התעללות בילדות', 'trauma'),
  ('אלימות בילדות', 'trauma'),
  ('נפגעתי בילדות', 'trauma'),
  ('בעיות אמון', 'relationships'),
  ('קשה לי לסמוך', 'relationships'),
  ('לא סומכת יותר', 'relationships'),
  ('לא סומך על אף אחד', 'relationships'),
  ('אחרי בגידה קשה לסמוך', 'relationships'),
  ('חוסר אמון', 'relationships'),
  ('הכול אפור', 'depression'),
  ('חוויות טראומטיות', 'trauma'),
  ('חרדות', 'anxiety'),
  ('קשיים בדימוי העצמי', 'self_identity'),
  ('הפרעת חרדה', 'anxiety'),
  ('משברי חיים', 'life_transitions'),
  ('דאגנות יתר', 'anxiety'),
  ('אבל ושכול', 'grief_loss'),
  ('OCD', 'ocd_compulsions'),
  ('דיכאונות', 'depression'),
  ('הפרעה טורדנית כפייתית', 'ocd_compulsions'),
  ('משבר חיים', 'life_transitions'),
  ('הדרכת הורים', 'family_parenting'),
  ('ביטחון עצמי נמוך', 'self_identity'),
  ('התמודדות עם אובדן', 'grief_loss'),
  ('טורדנות כפייתית', 'ocd_compulsions'),
  ('הפרעה אובססיבית קומפולסיבית', 'ocd_compulsions'),
  ('התמודדות עם אבל', 'grief_loss'),
  ('PTSD', 'trauma'),
  ('הפרעות חרדה', 'anxiety'),
  ('פוסט טראומה', 'trauma'),
  ('תהליך אבל', 'grief_loss'),
  ('התנהגות ממכרת', 'behavioral_addiction'),
  ('דימוי עצמי', 'self_identity'),
  ('ייעוץ להורים', 'family_parenting'),
  ('ערך עצמי נמוך', 'self_identity'),
  ('מחשבות טורדניות', 'ocd_compulsions'),
  ('הדרכה הורית', 'family_parenting'),
  ('מחשבות כפייתיות', 'ocd_compulsions'),
  ('חרדה', 'anxiety'),
  ('דיכאון', 'depression'),
  ('אובדן אדם קרוב', 'grief_loss'),
  ('תמיכה הורית', 'family_parenting'),
  ('תסמיני דיכאון', 'depression'),
  ('ליווי הורים', 'family_parenting'),
  ('מצב דיכאוני', 'depression'),
  ('טראומה נפשית', 'trauma'),
  ('התמכרויות', 'addiction'),
  ('דימוי עצמי נמוך', 'self_identity'),
  ('משברים בחיים', 'life_transitions'),
  ('הפרעה פוסט טראומטית', 'trauma'),
  ('אירוע טראומטי', 'trauma'),
  ('חוסר ביטחון עצמי', 'self_identity'),
  ('התמכרות', 'addiction'),
  ('פרידה זוגית', 'relationships'),
  ('התפרצויות זעם', 'emotional_regulation'),
  ('פגיעות מיניות', 'sexual_abuse_trauma'),
  ('יחסי הורים וילדים', 'family_parenting'),
  ('תקיפה מינית', 'sexual_abuse_trauma'),
  ('משבר זוגי', 'relationships'),
  ('הפרעת אישיות', 'personality_disorders'),
  ('קשיים בזוגיות', 'relationships'),
  ('טקסים כפייתיים', 'ocd_compulsions'),
  ('פוביות', 'anxiety'),
  ('נפגעי תקיפה מינית', 'sexual_abuse_trauma'),
  ('משבר זהות', 'self_identity'),
  ('חרדה מוכללת', 'anxiety'),
  ('קשיים בדימוי הגוף', 'body_image'),
  ('חרדה חברתית', 'anxiety'),
  ('תחושת חוסר שייכות', 'social_belonging'),
  ('התקף פאניקה', 'anxiety'),
  ('C-PTSD', 'trauma'),
  ('טראומה בילדות', 'trauma'),
  ('תחושת שחיקה', 'burnout'),
  ('קשיים ביחסי הורים וילדים', 'family_parenting'),
  ('קושי ביצירת קשרים חברתיים', 'social_belonging'),
  ('ויסות רגשי', 'emotional_regulation'),
  ('התעללות מינית', 'sexual_abuse_trauma'),
  ('התקפי פאניקה', 'anxiety'),
  ('קשיים בזהות העצמית', 'self_identity'),
  ('דימוי גוף שלילי', 'body_image'),
  ('CPTSD', 'trauma'),
  ('בולימיה', 'eating_disorders'),
  ('התנהגויות כפייתיות', 'ocd_compulsions'),
  ('הפרעת קשב וריכוז', 'adhd'),
  ('טראומה מורכבת', 'trauma'),
  ('הצפה רגשית', 'emotional_regulation'),
  ('זהות עצמית', 'self_identity'),
  ('ספקטרום אוטיסטי', 'autism'),
  ('פוביה', 'anxiety'),
  ('פגיעה מינית', 'sexual_abuse_trauma'),
  ('טקס כפייתי', 'ocd_compulsions'),
  ('קושי בשליטה בכעסים', 'emotional_regulation'),
  ('הפרעת חרדה מוכללת', 'anxiety'),
  ('אוטיזם', 'autism'),
  ('התנהגות כפייתית', 'ocd_compulsions'),
  ('הפרעות אישיות', 'personality_disorders'),
  ('חוסר שייכות', 'social_belonging'),
  ('שחיקה בעבודה', 'burnout'),
  ('חרדת בריאות', 'anxiety'),
  ('נפגעות תקיפה מינית', 'sexual_abuse_trauma'),
  ('ADHD', 'adhd'),
  ('קשיי זהות', 'self_identity'),
  ('טראומת ילדות', 'trauma'),
  ('אנורקסיה', 'eating_disorders'),
  ('שחיקה מקצועית', 'burnout'),
  ('קשיים בשליטה בכעסים', 'emotional_regulation'),
  ('קושי בזוגיות', 'relationships'),
  ('הפרעות אכילה', 'eating_disorders'),
  ('הפרעת אכילה', 'eating_disorders'),
  ('קשיי קשב וריכוז', 'adhd'),
  ('מתח הורי', 'family_parenting'),
  ('קשיים בהורות', 'family_parenting'),
  ('הספקטרום האוטיסטי', 'autism'),
  ('קשיים ביצירת קשרים חברתיים', 'social_belonging'),
  ('טראומה מינית', 'sexual_abuse_trauma'),
  ('דימוי גוף', 'body_image'),
  ('בדידות', 'social_belonging'),
  ('קשיים בוויסות רגשי', 'emotional_regulation'),
  ('קונפליקטים בין הורים לילדים', 'family_parenting'),
  ('הפרעת דחק פוסט טראומטית', 'trauma'),
  ('חוסר ביטחון', 'self_identity'),
  ('טיפול משפחתי', 'family_parenting'),
  ('ילד במשבר', 'family_parenting'),
  ('התפרצויות והתנהגות מאתגרת', 'behavioral_challenges'),
  ('נדודי שינה', 'sleep_difficulties'),
  ('בדידות וקשיים חברתיים', 'social_belonging'),
  ('קשר פוגעני', 'violence_abuse'),
  ('פחדים אצל ילדים', 'anxiety'),
  ('קושי בהירדמות', 'sleep_difficulties'),
  ('חרדה ודאגנות', 'anxiety'),
  ('הסתגלות לפרישה', 'life_transitions'),
  ('בחירת קריירה', 'career_direction'),
  ('הכנה לנישואין', 'relationships'),
  ('דיכאון ושינויים במצב הרוח', 'depression'),
  ('יקיצות מרובות', 'sleep_difficulties'),
  ('התמודדות לאחר אירוע ביטחוני', 'trauma'),
  ('הפרעות שינה', 'sleep_difficulties'),
  ('התמודדות עם גירושי הורים', 'family_parenting'),
  ('בעיות שינה', 'sleep_difficulties'),
  ('אלימות', 'violence_abuse'),
  ('חרדה ופחדים', 'anxiety'),
  ('התעללות פיזית', 'violence_abuse'),
  ('קנאה וחוסר אמון', 'relationships'),
  ('יחסים במשפחה', 'family_parenting'),
  ('אלימות במשפחה', 'violence_abuse'),
  ('יחסים בין אחים', 'family_parenting'),
  ('אובדן ואבל', 'grief_loss'),
  ('לחץ לימודי', 'performance_functioning'),
  ('תלות רגשית', 'relationships'),
  ('טיפול מיני', 'sexuality_intimacy'),
  ('זוגיות ומערכות יחסים', 'relationships'),
  ('גירושי הורים', 'family_parenting'),
  ('אינסומניה', 'sleep_difficulties'),
  ('קשיים בין אחים', 'family_parenting'),
  ('שימוש באלכוהול', 'substance_use'),
  ('שינה לא רציפה', 'sleep_difficulties'),
  ('משמעות ואיכות חיים', 'existential'),
  ('קושי ביצירת קשר', 'relationships'),
  ('מערכת יחסים פוגענית', 'violence_abuse'),
  ('הורות משותפת', 'family_parenting'),
  ('קונפליקטים חוזרים', 'relationships'),
  ('בגידה ואובדן אמון', 'relationships'),
  ('חרדה ולחץ', 'anxiety'),
  ('הפרעת שינה', 'sleep_difficulties'),
  ('התפרצויות וכעסים', 'emotional_regulation'),
  ('קושי להירדם', 'sleep_difficulties'),
  ('שחיקה ולחץ בעבודה', 'burnout'),
  ('קשיים מיניים', 'sexuality_intimacy'),
  ('משפחות משולבות', 'family_parenting'),
  ('מריבות וקונפליקטים במשפחה', 'family_parenting'),
  ('חרדת מבחנים', 'anxiety'),
  ('קשיים חברתיים ובדידות', 'social_belonging'),
  ('עיכוב התפתחותי', 'childhood_development'),
  ('קשיי הסתגלות', 'life_transitions'),
  ('גירושין ומשפחה בתהליך שינוי', 'family_parenting'),
  ('עצמאות ומעבר לחיים בוגרים', 'life_transitions'),
  ('אינטימיות ומיניות', 'sexuality_intimacy'),
  ('מערכות יחסים פוגעניות', 'violence_abuse'),
  ('קשיי שינה', 'sleep_difficulties'),
  ('פחד מטיסה', 'anxiety'),
  ('אלימות בזוגיות', 'violence_abuse'),
  ('שינוי משמעותי בחיים', 'life_transitions'),
  ('התעללות רגשית', 'violence_abuse'),
  ('דיכאון ומצב רוח ירוד', 'depression'),
  ('קשיים באינטימיות', 'sexuality_intimacy'),
  ('יחסים עם ההורים', 'family_parenting'),
  ('קשיים במיניות', 'sexuality_intimacy'),
  ('זוגיות פוגענית', 'violence_abuse'),
  ('שינויי חיים', 'life_transitions'),
  ('עישון', 'substance_use'),
  ('התמודדות עם ילד במשבר', 'family_parenting'),
  ('הפרעה דו קוטבית', 'bipolar_disorder'),
  ('הפרעה ביפולרית', 'bipolar_disorder'),
  ('ביפולר', 'bipolar_disorder'),
  ('מאניה דפרסיה', 'bipolar_disorder'),
  ('פסיכוזה', 'psychosis'),
  ('הפרעה פסיכוטית', 'psychosis'),
  ('הפרעות פסיכוטיות', 'psychosis'),
  ('מצב פסיכוטי', 'psychosis'),
  ('תקשורת בין אישית', 'communication_expression'),
  ('קשיים בתקשורת בין אישית', 'communication_expression'),
  ('קושי לבטא רגשות', 'communication_expression'),
  ('קושי בביטוי רגשי', 'communication_expression'),
  ('ביטוי רגשי', 'communication_expression'),
  ('ויסות חושי', 'sensory_processing'),
  ('עיבוד חושי', 'sensory_processing'),
  ('קשיים בוויסות חושי', 'sensory_processing'),
  ('קשיי עיבוד חושי', 'sensory_processing'),
  ('רגישות חושית', 'sensory_processing'),
  ('התנהגות מאתגרת', 'behavioral_challenges'),
  ('קשיי התנהגות', 'behavioral_challenges'),
  ('בעיות התנהגות', 'behavioral_challenges'),
  ('התנהגות מתנגדת', 'behavioral_challenges'),
  ('לקויות למידה', 'learning_difficulties'),
  ('קשיי למידה', 'learning_difficulties'),
  ('דיסלקציה', 'learning_difficulties'),
  ('דיסגרפיה', 'learning_difficulties'),
  ('דיסקלקוליה', 'learning_difficulties'),
  ('קשיי קואורדינציה', 'motor_coordination'),
  ('קואורדינציה מוטורית', 'motor_coordination'),
  ('עיכוב מוטורי', 'motor_coordination'),
  ('הפרעה התפתחותית בקואורדינציה', 'motor_coordination'),
  ('DCD', 'motor_coordination'),
  ('קשיי שפה', 'language_communication'),
  ('עיכוב שפתי', 'language_communication'),
  ('התפתחות שפה', 'language_communication'),
  ('קושי בהבנת שפה', 'language_communication'),
  ('קושי בהבעת שפה', 'language_communication'),
  ('קשיי היגוי', 'speech_articulation'),
  ('הפרעת היגוי', 'speech_articulation'),
  ('שיבושי היגוי', 'speech_articulation'),
  ('היגוי לא ברור', 'speech_articulation'),
  ('דיסארתריה', 'speech_articulation'),
  ('גמגום', 'fluency_stuttering'),
  ('הפרעת שטף דיבור', 'fluency_stuttering'),
  ('קשיי שטף בדיבור', 'fluency_stuttering'),
  ('חוסר שטף בדיבור', 'fluency_stuttering'),
  ('הפרעת קול', 'voice'),
  ('הפרעות קול', 'voice'),
  ('קשיי קול', 'voice'),
  ('דיספוניה', 'voice'),
  ('שיקום שמיעתי', 'hearing_auditory_rehabilitation'),
  ('ירידה בשמיעה', 'hearing_auditory_rehabilitation'),
  ('לקות שמיעה', 'hearing_auditory_rehabilitation'),
  ('קשיי שמיעה', 'hearing_auditory_rehabilitation'),
  ('אימון שמיעתי', 'hearing_auditory_rehabilitation'),
  ('קשיי בליעה', 'swallowing_feeding'),
  ('הפרעת בליעה', 'swallowing_feeding'),
  ('דיספגיה', 'swallowing_feeding'),
  ('קשיי לעיסה', 'swallowing_feeding'),
  ('אכילה תפקודית', 'swallowing_feeding'),
  ('הרגלי אכילה', 'nutrition_eating_habits'),
  ('שינוי הרגלי אכילה', 'nutrition_eating_habits'),
  ('שיפור הרגלי אכילה', 'nutrition_eating_habits'),
  ('תזונה והרגלי אכילה', 'nutrition_eating_habits'),
  ('תזונה רפואית', 'medical_nutrition'),
  ('תזונה במצבים רפואיים', 'medical_nutrition'),
  ('תזונה במחלות כרוניות', 'medical_nutrition'),
  ('התאמת תזונה למצב רפואי', 'medical_nutrition'),
  ('כאבי שריר ושלד', 'musculoskeletal_pain'),
  ('כאב שריר ושלד', 'musculoskeletal_pain'),
  ('כאבי גב', 'musculoskeletal_pain'),
  ('כאבי צוואר', 'musculoskeletal_pain'),
  ('כאבי מפרקים', 'musculoskeletal_pain'),
  ('כאב כרוני', 'chronic_pain'),
  ('כאבים כרוניים', 'chronic_pain'),
  ('כאב מתמשך', 'chronic_pain'),
  ('כאב ממושך', 'chronic_pain'),
  ('שיקום אורתופדי', 'orthopedic_rehabilitation'),
  ('שיקום לאחר ניתוח אורתופדי', 'orthopedic_rehabilitation'),
  ('שיקום אחרי ניתוח אורתופדי', 'orthopedic_rehabilitation'),
  ('שיקום לאחר שבר', 'orthopedic_rehabilitation'),
  ('שיקום נוירולוגי', 'neurological_rehabilitation'),
  ('שיקום לאחר שבץ', 'neurological_rehabilitation'),
  ('שיקום אחרי שבץ', 'neurological_rehabilitation'),
  ('שיקום לאחר אירוע מוחי', 'neurological_rehabilitation'),
  ('שיקום לאחר פגיעה מוחית', 'neurological_rehabilitation'),
  ('קשיי ניידות', 'mobility_balance'),
  ('בעיות ניידות', 'mobility_balance'),
  ('קשיי שיווי משקל', 'mobility_balance'),
  ('בעיות שיווי משקל', 'mobility_balance'),
  ('מניעת נפילות', 'mobility_balance'),
  ('רצפת אגן', 'pelvic_floor'),
  ('שיקום רצפת אגן', 'pelvic_floor'),
  ('חולשת רצפת אגן', 'pelvic_floor'),
  ('תפקוד רצפת אגן', 'pelvic_floor'),
  ('שיקום לב ריאה', 'cardiopulmonary_rehabilitation'),
  ('שיקום לבבי', 'cardiopulmonary_rehabilitation'),
  ('שיקום ריאתי', 'cardiopulmonary_rehabilitation'),
  ('שיקום נשימתי', 'cardiopulmonary_rehabilitation'),
  ('פציעות ספורט', 'sports_rehabilitation'),
  ('שיקום ספורט', 'sports_rehabilitation'),
  ('שיקום מפציעת ספורט', 'sports_rehabilitation'),
  ('חזרה לפעילות ספורטיבית', 'sports_rehabilitation'),
  ('תפקוד יומיומי', 'daily_functioning'),
  ('קשיים בתפקוד יומיומי', 'daily_functioning'),
  ('עצמאות בתפקוד', 'daily_functioning'),
  ('פעילויות היום יום', 'daily_functioning'),
  ('ADL', 'daily_functioning'),
  ('שיקום קוגניטיבי', 'cognitive_rehabilitation'),
  ('שיקום קוגניטיבי לאחר פגיעה מוחית', 'cognitive_rehabilitation'),
  ('שיקום קוגניטיבי לאחר אירוע מוחי', 'cognitive_rehabilitation'),
  ('אימון קוגניטיבי שיקומי', 'cognitive_rehabilitation'),
  ('מוטוריקה עדינה', 'fine_motor_graphomotor'),
  ('קשיים במוטוריקה עדינה', 'fine_motor_graphomotor'),
  ('גרפומוטוריקה', 'fine_motor_graphomotor'),
  ('קשיי גרפומוטוריקה', 'fine_motor_graphomotor'),
  ('ירידה קוגניטיבית', 'cognitive_decline_dementia'),
  ('דמנציה', 'cognitive_decline_dementia'),
  ('אלצהיימר', 'cognitive_decline_dementia'),
  ('הפרעה נוירוקוגניטיבית', 'cognitive_decline_dementia'),
  ('ירידה בתפקוד הקוגניטיבי', 'cognitive_decline_dementia'),
  ('היריון ולידה', 'pregnancy_birth_postpartum'),
  ('הריון ולידה', 'pregnancy_birth_postpartum'),
  ('משכב לידה', 'pregnancy_birth_postpartum'),
  ('תקופה לאחר לידה', 'pregnancy_birth_postpartum'),
  ('התאוששות לאחר לידה', 'pregnancy_birth_postpartum'),
  ('הנקה', 'breastfeeding_lactation'),
  ('קשיי הנקה', 'breastfeeding_lactation'),
  ('בעיות בהנקה', 'breastfeeding_lactation'),
  ('ייעוץ הנקה', 'breastfeeding_lactation'),
  ('ליווי הנקה', 'breastfeeding_lactation'),
  ('התמודדות עם טיפולי פוריות', 'fertility_journey'),
  ('ליווי בטיפולי פוריות', 'fertility_journey'),
  ('מסע פוריות', 'fertility_journey'),
  ('קשיים סביב פוריות', 'fertility_journey'),
  ('ליווי סביב פוריות', 'fertility_journey'),
  ('התמודדות עם מחלה כרונית', 'chronic_illness_adjustment'),
  ('הסתגלות למחלה כרונית', 'chronic_illness_adjustment'),
  ('חיים עם מחלה כרונית', 'chronic_illness_adjustment'),
  ('התמודדות עם מצב רפואי כרוני', 'chronic_illness_adjustment'),
  ('שיקום רפואי', 'medical_rehabilitation'),
  ('שיקום לאחר אשפוז', 'medical_rehabilitation'),
  ('שיקום אחרי אשפוז', 'medical_rehabilitation'),
  ('שיקום לאחר מחלה', 'medical_rehabilitation'),
  ('שיקום לאחר ניתוח', 'medical_rehabilitation'),
  ('הסתגלות למוגבלות', 'disability_adjustment'),
  ('התמודדות עם מוגבלות', 'disability_adjustment'),
  ('חיים עם מוגבלות', 'disability_adjustment'),
  ('הסתגלות לשינוי תפקודי', 'disability_adjustment'),
  ('התמודדות עם שינוי תפקודי', 'disability_adjustment');

-- ---------------------------------------------------------------------------
-- PREFLIGHT VALIDATION
-- ---------------------------------------------------------------------------
do $$
declare
  problems_total integer;
  problems_active integer;
  source_alias_count integer;
  final_alias_count integer;
  final_target_count integer;
  missing_or_inactive_targets text;
  inbound_fk_count integer;
begin
  select count(*),
         count(*) filter (where is_active)
    into problems_total, problems_active
  from public.problems;

  if problems_total <> 104 or problems_active <> 62 then
    raise exception
      'Migration aborted: expected public.problems = 104 total / 62 active, found % total / % active',
      problems_total, problems_active;
  end if;

  select count(*)
    into source_alias_count
  from public.problem_aliases;

  -- 500 = expected state before first run.
  -- 483 = expected state when safely rerunning this migration.
  if source_alias_count not in (500, 483) then
    raise exception
      'Migration aborted: expected 500 aliases before first run or 483 on rerun, found %',
      source_alias_count;
  end if;

  select count(*), count(distinct target_slug)
    into final_alias_count, final_target_count
  from _final_problem_aliases;

  if final_alias_count <> 483 then
    raise exception
      'Migration aborted: embedded final alias catalog must contain 483 aliases, found %',
      final_alias_count;
  end if;

  if final_target_count <> 62 then
    raise exception
      'Migration aborted: embedded aliases must cover 62 canonical targets, found %',
      final_target_count;
  end if;

  select string_agg(f.target_slug, ', ' order by f.target_slug)
    into missing_or_inactive_targets
  from (
    select distinct target_slug
    from _final_problem_aliases
  ) f
  left join public.problems p
    on p.slug = f.target_slug
   and p.is_active = true
  where p.id is null;

  if missing_or_inactive_targets is not null then
    raise exception
      'Migration aborted: alias targets are missing or inactive: %',
      missing_or_inactive_targets;
  end if;

  -- Runtime safety check: no table may depend on problem_aliases.id.
  select count(*)
    into inbound_fk_count
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.problem_aliases'::regclass;

  if inbound_fk_count <> 0 then
    raise exception
      'Migration aborted: public.problem_aliases has % inbound foreign key(s); rebuild is unsafe',
      inbound_fk_count;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- REBUILD problem_aliases
-- ---------------------------------------------------------------------------
delete from public.problem_aliases;

insert into public.problem_aliases (
  problem_id,
  alias
)
select
  p.id,
  f.alias
from _final_problem_aliases f
join public.problems p
  on p.slug = f.target_slug
 and p.is_active = true
order by f.target_slug, f.alias;

-- ---------------------------------------------------------------------------
-- ENFORCE THE NEW CONTRACT:
-- one exact alias string -> one canonical treatment domain.
-- Existing RLS policies are left unchanged.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.problem_aliases'::regclass
      and conname = 'problem_aliases_alias_key'
      and contype = 'u'
  ) then
    alter table public.problem_aliases
      add constraint problem_aliases_alias_key unique (alias);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VALIDATION
-- Any failure rolls back DELETE + INSERT + constraint creation.
-- ---------------------------------------------------------------------------
do $$
declare
  alias_count integer;
  distinct_alias_count integer;
  target_count integer;
  inactive_target_count integer;
  orphan_count integer;
  bad_pair_count integer;
  missing_pair_count integer;
  unique_constraint_count integer;
begin
  select count(*), count(distinct alias)
    into alias_count, distinct_alias_count
  from public.problem_aliases;

  if alias_count <> 483 then
    raise exception
      'Validation failed: expected 483 aliases, found %',
      alias_count;
  end if;

  if distinct_alias_count <> 483 then
    raise exception
      'Validation failed: expected 483 distinct aliases, found %',
      distinct_alias_count;
  end if;

  select count(distinct p.slug)
    into target_count
  from public.problem_aliases a
  join public.problems p on p.id = a.problem_id;

  if target_count <> 62 then
    raise exception
      'Validation failed: expected aliases to cover 62 targets, found %',
      target_count;
  end if;

  select count(*)
    into inactive_target_count
  from public.problem_aliases a
  join public.problems p on p.id = a.problem_id
  where p.is_active is distinct from true;

  if inactive_target_count <> 0 then
    raise exception
      'Validation failed: % aliases point to inactive/noncanonical problems',
      inactive_target_count;
  end if;

  select count(*)
    into orphan_count
  from public.problem_aliases a
  left join public.problems p on p.id = a.problem_id
  where p.id is null;

  if orphan_count <> 0 then
    raise exception
      'Validation failed: % aliases have orphan problem_id values',
      orphan_count;
  end if;

  -- Database must contain no alias->slug pair outside the authoritative set.
  select count(*)
    into bad_pair_count
  from public.problem_aliases a
  join public.problems p on p.id = a.problem_id
  left join _final_problem_aliases f
    on f.alias = a.alias
   and f.target_slug = p.slug
  where f.alias is null;

  if bad_pair_count <> 0 then
    raise exception
      'Validation failed: % database alias mappings are not in the final catalog',
      bad_pair_count;
  end if;

  -- Every authoritative alias->slug pair must exist in the database.
  select count(*)
    into missing_pair_count
  from _final_problem_aliases f
  left join public.problems p
    on p.slug = f.target_slug
   and p.is_active = true
  left join public.problem_aliases a
    on a.alias = f.alias
   and a.problem_id = p.id
  where a.id is null;

  if missing_pair_count <> 0 then
    raise exception
      'Validation failed: % final alias mappings are missing from the database',
      missing_pair_count;
  end if;

  select count(*)
    into unique_constraint_count
  from pg_constraint
  where conrelid = 'public.problem_aliases'::regclass
    and conname = 'problem_aliases_alias_key'
    and contype = 'u';

  if unique_constraint_count <> 1 then
    raise exception
      'Validation failed: UNIQUE(alias) constraint was not created';
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- READ-ONLY REPORT AFTER SUCCESS
-- Expected:
--   total_aliases = 483
--   distinct_aliases = 483
--   canonical_targets_covered = 62
--   aliases_to_inactive_targets = 0
-- ---------------------------------------------------------------------------
select
  count(*) as total_aliases,
  count(distinct a.alias) as distinct_aliases,
  count(distinct p.slug) as canonical_targets_covered,
  count(*) filter (where p.is_active is distinct from true) as aliases_to_inactive_targets
from public.problem_aliases a
join public.problems p
  on p.id = a.problem_id;

-- Distribution by canonical domain:
select
  p.sort_order,
  p.slug,
  p.name_he,
  count(*) as alias_count
from public.problem_aliases a
join public.problems p
  on p.id = a.problem_id
group by p.id, p.sort_order, p.slug, p.name_he
order by p.sort_order;

export type ModalityGroupId =
  | "dynamic-depth"
  | "cognitive-behavioral"
  | "trauma-processing"
  | "humanistic-experiential"
  | "systemic-interpersonal"
  | "integrative-specialized";

export type CanonicalModality = {
  slug: string;
  nameHe: string;
  nameEn: string;
  groupId: ModalityGroupId;
  sortOrder: number;
  aliases: readonly string[];
};

export type ModalityGroupDefinition = {
  id: ModalityGroupId;
  title: string;
  description: string;
};

export const MODALITY_GROUPS: readonly ModalityGroupDefinition[] = [
  {
    id: "dynamic-depth",
    title: "דינמיות ועומק",
    description: "גישות המתמקדות בעולם הפנימי, בדפוסי קשר ובתהליכים לא מודעים.",
  },
  {
    id: "cognitive-behavioral",
    title: "קוגניטיביות והתנהגותיות",
    description: "CBT, גישות הגל השלישי ושיטות ממוקדות שינוי התנהגותי וקוגניטיבי.",
  },
  {
    id: "trauma-processing",
    title: "טראומה ועיבוד",
    description: "גישות ושיטות המשמשות לעבודה ממוקדת טראומה וזיכרונות קשים.",
  },
  {
    id: "humanistic-experiential",
    title: "הומניסטיות וחווייתיות",
    description: "גישות המדגישות חוויה, רגש, משמעות והקשר הטיפולי.",
  },
  {
    id: "systemic-interpersonal",
    title: "מערכתיות ובין־אישיות",
    description: "גישות המתמקדות ביחסים, משפחה, זוגיות ודפוסים בין־אישיים.",
  },
  {
    id: "integrative-specialized",
    title: "אינטגרטיביות ונוספות",
    description: "גישות אינטגרטיביות ושיטות נוספות בעלות שימוש קליני מובחן.",
  },
];

export const CANONICAL_MODALITIES: readonly CanonicalModality[] = [
  {
    slug: "psychodynamic",
    nameHe: "טיפול פסיכודינמי",
    nameEn: "Psychodynamic Therapy",
    groupId: "dynamic-depth",
    sortOrder: 10,
    aliases: ["טיפול דינמי", "פסיכותרפיה פסיכודינמית", "פסיכותרפיה דינמית"],
  },
  {
    slug: "psychoanalysis",
    nameHe: "פסיכואנליזה",
    nameEn: "Psychoanalysis",
    groupId: "dynamic-depth",
    sortOrder: 20,
    aliases: ["טיפול פסיכואנליטי"],
  },
  {
    slug: "relational",
    nameHe: "הגישה ההתייחסותית",
    nameEn: "Relational Psychotherapy",
    groupId: "dynamic-depth",
    sortOrder: 30,
    aliases: ["טיפול התייחסותי", "פסיכותרפיה התייחסותית", "גישה התייחסותית"],
  },
  {
    slug: "mbt",
    nameHe: "טיפול מבוסס מנטליזציה (MBT)",
    nameEn: "Mentalization-Based Treatment (MBT)",
    groupId: "dynamic-depth",
    sortOrder: 40,
    aliases: ["טיפול מבוסס מנטליזציה", "מנטליזציה", "MBT"],
  },
  {
    slug: "adlerian",
    nameHe: "פסיכותרפיה אדלריאנית",
    nameEn: "Adlerian Psychotherapy",
    groupId: "dynamic-depth",
    sortOrder: 50,
    aliases: ["טיפול אדלריאני", "גישה אדלריאנית", "פסיכולוגיה אינדיבידואלית"],
  },
  {
    slug: "cbt",
    nameHe: "טיפול קוגניטיבי־התנהגותי (CBT)",
    nameEn: "Cognitive Behavioral Therapy (CBT)",
    groupId: "cognitive-behavioral",
    sortOrder: 110,
    aliases: ["CBT", "טיפול קוגניטיבי התנהגותי", "טיפול התנהגותי קוגניטיבי", "סי בי טי"],
  },
  {
    slug: "act",
    nameHe: "טיפול בקבלה ומחויבות (ACT)",
    nameEn: "Acceptance and Commitment Therapy (ACT)",
    groupId: "cognitive-behavioral",
    sortOrder: 120,
    aliases: ["ACT", "טיפול בקבלה ומחוייבות"],
  },
  {
    slug: "dbt",
    nameHe: "טיפול דיאלקטי־התנהגותי (DBT)",
    nameEn: "Dialectical Behavior Therapy (DBT)",
    groupId: "cognitive-behavioral",
    sortOrder: 130,
    aliases: ["DBT", "טיפול דיאלקטי התנהגותי"],
  },
  {
    slug: "schema-therapy",
    nameHe: "סכמה תרפיה",
    nameEn: "Schema Therapy",
    groupId: "cognitive-behavioral",
    sortOrder: 140,
    aliases: ["טיפול בסכמה", "טיפול מבוסס סכמה", "Schema Therapy"],
  },
  {
    slug: "mbct",
    nameHe: "טיפול קוגניטיבי מבוסס מיינדפולנס (MBCT)",
    nameEn: "Mindfulness-Based Cognitive Therapy (MBCT)",
    groupId: "cognitive-behavioral",
    sortOrder: 150,
    aliases: ["MBCT", "טיפול מבוסס מיינדפולנס", "מיינדפולנס קוגניטיבי"],
  },
  {
    slug: "cft",
    nameHe: "טיפול ממוקד חמלה (CFT)",
    nameEn: "Compassion Focused Therapy (CFT)",
    groupId: "cognitive-behavioral",
    sortOrder: 160,
    aliases: ["CFT", "טיפול מבוסס חמלה", "טיפול ממוקד בחמלה"],
  },
  {
    slug: "erp",
    nameHe: "חשיפה ומניעת תגובה (ERP)",
    nameEn: "Exposure and Response Prevention (ERP)",
    groupId: "cognitive-behavioral",
    sortOrder: 170,
    aliases: ["ERP", "חשיפה ומניעת תגובה", "חשיפה ומניעת טקסים"],
  },
  {
    slug: "emdr",
    nameHe: "EMDR",
    nameEn: "Eye Movement Desensitization and Reprocessing (EMDR)",
    groupId: "trauma-processing",
    sortOrder: 210,
    aliases: ["טיפול EMDR", "תרפיית EMDR", "אי אם די אר"],
  },
  {
    slug: "prolonged-exposure",
    nameHe: "חשיפה ממושכת (PE)",
    nameEn: "Prolonged Exposure (PE)",
    groupId: "trauma-processing",
    sortOrder: 220,
    aliases: ["PE", "טיפול בחשיפה ממושכת", "Prolonged Exposure"],
  },
  {
    slug: "cpt",
    nameHe: "טיפול בעיבוד קוגניטיבי (CPT)",
    nameEn: "Cognitive Processing Therapy (CPT)",
    groupId: "trauma-processing",
    sortOrder: 230,
    aliases: ["CPT", "עיבוד קוגניטיבי לטראומה"],
  },
  {
    slug: "tf-cbt",
    nameHe: "CBT ממוקד טראומה (TF-CBT)",
    nameEn: "Trauma-Focused Cognitive Behavioral Therapy (TF-CBT)",
    groupId: "trauma-processing",
    sortOrder: 240,
    aliases: ["TF-CBT", "טיפול קוגניטיבי התנהגותי ממוקד טראומה", "CBT לטראומה"],
  },
  {
    slug: "somatic-experiencing",
    nameHe: "Somatic Experiencing (SE)",
    nameEn: "Somatic Experiencing (SE)",
    groupId: "trauma-processing",
    sortOrder: 250,
    aliases: ["Somatic Experiencing", "חוויה סומטית", "התנסות סומטית"],
  },
  {
    slug: "body-psychotherapy",
    nameHe: "פסיכותרפיה גופנית / גוף־נפש",
    nameEn: "Body Psychotherapy",
    groupId: "trauma-processing",
    sortOrder: 260,
    aliases: ["פסיכותרפיה גופנית", "טיפול גוף נפש", "טיפול גוף־נפש", "פסיכותרפיה גוף נפש"],
  },
  {
    slug: "person-centered",
    nameHe: "טיפול ממוקד אדם",
    nameEn: "Person-Centered Therapy",
    groupId: "humanistic-experiential",
    sortOrder: 310,
    aliases: ["טיפול ממוקד לקוח", "גישה ממוקדת אדם", "הגישה הרוג'ריאנית", "טיפול רוג'ריאני"],
  },
  {
    slug: "emotion-focused",
    nameHe: "טיפול ממוקד רגש",
    nameEn: "Emotion-Focused Therapy",
    groupId: "humanistic-experiential",
    sortOrder: 320,
    aliases: ["Emotion-Focused Therapy", "טיפול ממוקד ברגש"],
  },
  {
    slug: "gestalt",
    nameHe: "טיפול בגישת הגשטלט",
    nameEn: "Gestalt Therapy",
    groupId: "humanistic-experiential",
    sortOrder: 330,
    aliases: ["גשטלט", "טיפול גשטלט", "Gestalt"],
  },
  {
    slug: "existential",
    nameHe: "טיפול אקזיסטנציאלי",
    nameEn: "Existential Therapy",
    groupId: "humanistic-experiential",
    sortOrder: 340,
    aliases: ["פסיכותרפיה אקזיסטנציאלית", "גישה אקזיסטנציאלית"],
  },
  {
    slug: "focusing",
    nameHe: "התמקדות (Focusing)",
    nameEn: "Focusing-Oriented Therapy",
    groupId: "humanistic-experiential",
    sortOrder: 350,
    aliases: ["Focusing", "פוקוסינג", "טיפול בהתמקדות"],
  },
  {
    slug: "psychodrama",
    nameHe: "פסיכודרמה",
    nameEn: "Psychodrama",
    groupId: "humanistic-experiential",
    sortOrder: 360,
    aliases: ["טיפול בפסיכודרמה", "Psychodrama"],
  },
  {
    slug: "systemic-family",
    nameHe: "טיפול מערכתי ומשפחתי",
    nameEn: "Systemic and Family Therapy",
    groupId: "systemic-interpersonal",
    sortOrder: 410,
    aliases: ["טיפול מערכתי", "גישה מערכתית", "טיפול משפחתי מערכתי"],
  },
  {
    slug: "eft-couples",
    nameHe: "טיפול זוגי ממוקד רגש (EFCT)",
    nameEn: "Emotionally Focused Couple Therapy (EFCT)",
    groupId: "systemic-interpersonal",
    sortOrder: 420,
    aliases: ["EFCT", "EFT זוגי", "טיפול זוגי ממוקד ברגש"],
  },
  {
    slug: "narrative",
    nameHe: "טיפול נרטיבי",
    nameEn: "Narrative Therapy",
    groupId: "systemic-interpersonal",
    sortOrder: 430,
    aliases: ["גישה נרטיבית", "תרפיה נרטיבית"],
  },
  {
    slug: "solution-focused",
    nameHe: "טיפול ממוקד פתרונות (SFBT)",
    nameEn: "Solution-Focused Brief Therapy (SFBT)",
    groupId: "systemic-interpersonal",
    sortOrder: 440,
    aliases: ["SFBT", "טיפול ממוקד פתרון", "טיפול קצר מועד ממוקד פתרונות"],
  },
  {
    slug: "ipt",
    nameHe: "פסיכותרפיה בין־אישית (IPT)",
    nameEn: "Interpersonal Psychotherapy (IPT)",
    groupId: "systemic-interpersonal",
    sortOrder: 450,
    aliases: ["IPT", "טיפול בין אישי", "טיפול בין־אישי"],
  },
  {
    slug: "attachment-based",
    nameHe: "טיפול מבוסס התקשרות",
    nameEn: "Attachment-Based Therapy",
    groupId: "systemic-interpersonal",
    sortOrder: 460,
    aliases: ["גישה מבוססת התקשרות", "טיפול ממוקד התקשרות"],
  },
  {
    slug: "integrative",
    nameHe: "טיפול אינטגרטיבי",
    nameEn: "Integrative Psychotherapy",
    groupId: "integrative-specialized",
    sortOrder: 510,
    aliases: ["פסיכותרפיה אינטגרטיבית", "גישה אינטגרטיבית", "טיפול משולב"],
  },
  {
    slug: "ifs",
    nameHe: "Internal Family Systems (IFS)",
    nameEn: "Internal Family Systems (IFS)",
    groupId: "integrative-specialized",
    sortOrder: 520,
    aliases: ["IFS", "מערכות משפחתיות פנימיות", "עבודת חלקים"],
  },
  {
    slug: "play-therapy",
    nameHe: "טיפול במשחק",
    nameEn: "Play Therapy",
    groupId: "integrative-specialized",
    sortOrder: 530,
    aliases: ["תרפיה במשחק", "Play Therapy"],
  },
  {
    slug: "dyadic-parent-child",
    nameHe: "טיפול דיאדי / הורה–ילד",
    nameEn: "Dyadic Parent-Child Therapy",
    groupId: "integrative-specialized",
    sortOrder: 540,
    aliases: ["טיפול דיאדי", "טיפול הורה ילד", "טיפול הורה־ילד"],
  },
];

export const CANONICAL_MODALITY_SLUGS = new Set(
  CANONICAL_MODALITIES.map((modality) => modality.slug),
);

export function modalityGroupForSlug(slug: string): ModalityGroupDefinition | null {
  const item = CANONICAL_MODALITIES.find((modality) => modality.slug === slug);
  if (!item) return null;
  return MODALITY_GROUPS.find((group) => group.id === item.groupId) ?? null;
}

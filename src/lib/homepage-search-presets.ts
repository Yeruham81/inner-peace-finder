/**
 * Curated homepage search presets.
 *
 * These searches are authored by Tipulinks, so their meaning is already
 * known. They MUST navigate with canonical structured parameters instead of
 * feeding their display label back through the free-text/LLM path.
 *
 * Deliberately no `q` field exists here. That makes the no-LLM guarantee
 * structural: a preset cannot accidentally create a semantic remainder.
 */

export type HomepageSearchPresetSearch = {
  problem?: string;
  city?: string;
  population?: string;
  languages?: string;
  regions?: string;
  serviceTypes?: string;
  professions?: string;
  therapyFormats?: string;
  gender?: "male" | "female";
};

export type HomepageSearchPreset = {
  label: string;
  search: Readonly<HomepageSearchPresetSearch>;
};

export const HOMEPAGE_SEARCH_PRESETS = [
  {
    label: "טיפול בחרדה חברתית לבני נוער",
    search: {
      problem: "anxiety",
      population: "adolescents",
    },
  },
  {
    label: "טיפול זוגי באזור השרון",
    search: {
      regions: "sharon",
      therapyFormats: "couples",
    },
  },
  {
    label: "קלינאית תקשורת לפעוטות בפתח תקווה",
    search: {
      city: "פתח תקווה",
      population: "infants",
      professions: "speech-language-pathologist",
    },
  },
  {
    label: "פסיכולוג ילדים לקשב וריכוז בתל אביב",
    search: {
      problem: "adhd",
      city: "תל אביב",
      population: "children",
      professions: "psychologist",
    },
  },
  {
    label: "טיפול אונליין בדיכאון בעברית",
    search: {
      problem: "depression",
      languages: "he",
      serviceTypes: "online",
    },
  },
  {
    label: "טיפול בטראומה באזור ירושלים",
    search: {
      problem: "trauma",
      regions: "jerusalem-area",
    },
  },
  {
    label: "פסיכולוגית דוברת רוסית באזור חיפה",
    search: {
      languages: "ru",
      regions: "haifa-krayot",
      professions: "psychologist",
      gender: "female",
    },
  },
  {
    label: "הדרכת הורים להתפרצויות זעם",
    search: {
      problem: "emotional_regulation",
      therapyFormats: "parent_guidance",
    },
  },
] as const satisfies readonly HomepageSearchPreset[];

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { TherapistImageUpload } from "@/components/therapist-image-upload";
import { TherapistCredentialPanel } from "@/components/therapist-credential-panel";
import { TherapistProfileView } from "@/components/therapist-profile-view";
import { buildPreviewViewData } from "@/lib/profile-preview-adapter";
import { orderCanonicalLanguages } from "@/lib/language-options";
import { PRODUCT_REGIONS } from "@/lib/locality-options";
import { MODALITY_GROUPS, modalityGroupForSlug } from "@/lib/modality-options";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  getEditorOptions,
  getMyProfile,
  getSemanticFeedback,
  deleteMyProfilePermanently,
  saveMyProfile,
  setMyProfileVisibility,
  type EditorOptions,
  type Gender,
  type ProfileEditorData,
} from "@/lib/therapist-profile.functions";

export const Route = createFileRoute("/_authenticated/new-profile")({
  head: () => ({
    meta: [{ title: "עורך פרופיל מטפל | Tipulinks" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: EditorPage,
});

type ProductRegion = EditorOptions["localities"][number]["region"];

type FormLocation = {
  city: string;
  region: ProductRegion | "";
  address: string;
  accessibility_status: "accessible" | "partially_accessible" | "not_accessible" | "unknown";
  accessibility_features: string[];
  accessibility_note: string;
};

const MAX_PHYSICAL_LOCATIONS = 3;
const ACCESSIBILITY_FEATURES = [
  { id: "step_free_entrance", label: "כניסה ללא מדרגות" },
  { id: "accessible_elevator", label: "מעלית נגישה" },
  { id: "accessible_restroom", label: "שירותים נגישים" },
  { id: "accessible_parking", label: "חניית נכים" },
  { id: "wide_doorways", label: "פתחים רחבים" },
  { id: "hearing_loop", label: "לולאת השראה" },
];

function blankLocation(): FormLocation {
  return {
    city: "",
    region: "",
    address: "",
    accessibility_status: "unknown",
    accessibility_features: [],
    accessibility_note: "",
  };
}

function isValidEmailInput(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhoneInput(value: string): boolean {
  const raw = value.trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return false;

  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return digits.length >= 10 && digits.length <= 15;

  // Israeli local numbers: landlines are commonly 9 digits and mobile numbers 10.
  return digits.length >= 9 && digits.length <= 10;
}

type FormState = {
  full_name: string;
  gender: Gender | "";
  professional_title: string;
  full_description: string;
  short_intro: string;
  background: string;
  years_experience: string;
  email: string;
  phone: string;
  image_url: string;
  profession_ids: string[];
  modality_ids: string[];
  language_ids: string[];
  population_ids: string[];
  locations: FormLocation[];
  online_available: boolean;
  home_visit_available: boolean;
  home_visit_regions: ProductRegion[];
  therapy_format_ids: string[];
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  free_intro_types: string[];
  free_intro_duration_minutes: string;
  professional_memberships: {
    organization_name: string;
    membership_start_date: string;
    member_since: string;
  }[];
  service_arrangements: { organization_name: string; note: string }[];
};

const emptyForm: FormState = {
  full_name: "",
  gender: "",
  professional_title: "",
  full_description: "",
  short_intro: "",
  background: "",
  years_experience: "",
  email: "",
  phone: "",
  image_url: "",
  profession_ids: [],
  modality_ids: [],
  language_ids: [],
  population_ids: [],
  locations: [blankLocation()],
  online_available: false,
  home_visit_available: false,
  home_visit_regions: [],
  therapy_format_ids: [],
  lgbtq_affirming: false,
  offers_free_intro: false,
  free_intro_types: [],
  free_intro_duration_minutes: "",
  professional_memberships: [],
  service_arrangements: [],
};

type ProfessionOption = {
  id: string;
  name_he: string;
};

type ModalityOption = {
  id: string;
  name_he: string;
  slug: string;
};

type ProfessionCategoryDefinition = {
  id: string;
  title: string;
  professionNames: readonly string[];
};

const PROFESSION_CATEGORIES: readonly ProfessionCategoryDefinition[] = [
  {
    id: "emotional-therapy",
    title: "פסיכותרפיה וטיפול רגשי",
    professionNames: [
      "מטפל",
      "מטפל רגשי",
      "פסיכותרפיסט",
      "פסיכותרפיסט קוגניטיבי-התנהגותי",
      "פסיכותרפיסט גופני",
      "פסיכואנליטיקאי",
      "יועץ טיפולי",
      "מקצוע טיפולי אחר",
      "תחום טיפולי אחר",
    ],
  },
  {
    id: "psychology-psychiatry",
    title: "פסיכולוגיה ופסיכיאטריה",
    professionNames: [
      "פסיכולוג",
      "פסיכולוג קליני",
      "פסיכולוג חינוכי",
      "פסיכולוג רפואי",
      "פסיכולוג שיקומי",
      "פסיכולוג התפתחותי",
      "פסיכולוג ארגוני",
      "פסיכולוג תעסוקתי",
      "פסיכולוג תעסוקתי-ארגוני",
      "פסיכולוג חברתי-תעסוקתי-ארגוני",
      "פסיכיאטר",
      "פסיכיאטר ילדים ונוער",
    ],
  },
  {
    id: "social-family",
    title: "זוגיות משפחה ורווחה",
    professionNames: [
      "עובד סוציאלי",
      "עובד סוציאלי קליני",
      "עובד סוציאלי משפחתי",
      "מטפל זוגי",
      "מטפל משפחתי",
      "מטפל מיני",
      "מדריך הורים",
      "מגשר",
    ],
  },
  {
    id: "arts-experiential",
    title: "טיפול באמצעות אומנויות",
    professionNames: [
      "מטפל באומנויות",
      "מטפל באמצעות אומנויות",
      "מטפל באמנות חזותית",
      "מטפל במוזיקה",
      "מטפל בתנועה ובמחול",
      "מטפל בדרמה",
      "מטפל בפסיכודרמה",
      "פסיכודרמטיסט",
      "ביבליותרפיסט",
      "מטפל בעזרת בעלי חיים",
    ],
  },
  {
    id: "health-rehabilitation",
    title: "שיקום בריאות והתפתחות",
    professionNames: [
      "מרפא בעיסוק",
      "קלינאי תקשורת",
      "פיזיותרפיסט",
      "דיאטן קליני",
      "תזונאי קליני",
      "קרימינולוג קליני",
      "קרימינולוג חברתי-שיקומי",
      "מנתח התנהגות",
      "אח מומחה בפסיכיאטריה",
      "אחות מומחית בפסיכיאטריה",
      "רופא",
      "משקם",
    ],
  },
  {
    id: "guidance-diagnosis-coaching",
    title: "ייעוץ אבחון ואימון",
    professionNames: [
      "יועץ חינוכי",
      "מאבחן דידקטי",
      "מנחה קבוצות",
      "מאמן אישי",
      "מאבחן",
      "מדריך",
      "מנחה",
      "מעריך",
      "יועץ",
    ],
  },
] as const;

function normalizeProfessionName(value: string): string {
  return value
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function fromProfile(p: ProfileEditorData, editorOptions: EditorOptions): FormState {
  const locations: FormLocation[] = p.locations.length
    ? p.locations.map((location) => {
        const canonical = editorOptions.localities.find((item) => item.name === location.city);
        return {
          city: canonical?.name ?? location.city,
          region: canonical?.region ?? location.region ?? "",
          address: location.address ?? "",
          accessibility_status: location.accessibility_status as FormLocation["accessibility_status"],
          accessibility_features: location.accessibility_features,
          accessibility_note: location.accessibility_note ?? "",
        };
      })
    : [blankLocation()];

  return {
    full_name: p.full_name ?? "",
    gender: (p.gender ?? "") as Gender | "",
    professional_title: p.professional_title ?? "",
    full_description: p.full_description ?? "",
    short_intro: p.short_intro ?? "",
    background: p.background ?? "",
    years_experience: p.years_experience !== null ? String(p.years_experience) : "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    image_url: p.image_url ?? "",
    profession_ids: p.profession_ids,
    modality_ids: p.modality_ids,
    language_ids: p.language_ids,
    population_ids: p.population_ids,
    locations,
    online_available: p.online_available,
    home_visit_available: p.home_visit_available,
    home_visit_regions: p.home_visit_regions,
    therapy_format_ids: p.therapy_format_ids,
    lgbtq_affirming: p.lgbtq_affirming,
    offers_free_intro: p.offers_free_intro,
    free_intro_types: p.free_intro_types,
    free_intro_duration_minutes: p.free_intro_duration_minutes === null ? "" : String(p.free_intro_duration_minutes),
    professional_memberships: p.professional_memberships.map((item) => ({
      ...item,
      membership_start_date: item.membership_start_date ?? "",
      member_since: item.member_since === null ? "" : String(item.member_since),
    })),
    service_arrangements: p.service_arrangements.map((item) => ({
      ...item,
      note: item.note ?? "",
    })),
  };
}

function EditorPage() {
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const getOptionsFn = useServerFn(getEditorOptions);
  const saveFn = useServerFn(saveMyProfile);
  const setVisibilityFn = useServerFn(setMyProfileVisibility);
  const deleteProfileFn = useServerFn(deleteMyProfilePermanently);

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn() });
  const options = useQuery({ queryKey: ["editor-options"], queryFn: () => getOptionsFn() });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialized, setInitialized] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (initialized || !profile.isSuccess || !options.isSuccess) return;
    if (profile.data) setForm(fromProfile(profile.data, options.data));
    setInitialized(true);
  }, [profile.data, profile.isSuccess, options.data, options.isSuccess, initialized]);

  const mutation = useMutation({
    mutationFn: (publish: boolean) =>
      saveFn({
        data: {
          full_name: form.full_name,
          gender: form.gender || null,
          professional_title: form.professional_title || null,
          full_description: form.full_description || null,
          short_intro: form.short_intro || null,
          background: form.background || null,
          years_experience: form.years_experience ? Number(form.years_experience) : null,
          email: form.email || null,
          phone: form.phone || null,
          image_url: form.image_url || null,
          profession_ids: form.profession_ids,
          modality_ids: form.modality_ids,
          language_ids: form.language_ids,
          population_ids: form.population_ids,
          locations: form.locations
            .filter((location) => location.city.trim().length > 0)
            .map((location) => ({
              city: location.city,
              region: location.region as ProductRegion,
              address: location.address || null,
              accessibility_status: location.accessibility_status,
              accessibility_features: location.accessibility_features,
              accessibility_note: location.accessibility_note || null,
            })),
          online_available: form.online_available,
          home_visit_available: form.home_visit_available,
          home_visit_regions: form.home_visit_regions,
          therapy_format_ids: form.therapy_format_ids,
          lgbtq_affirming: form.lgbtq_affirming,
          offers_free_intro: form.offers_free_intro,
          free_intro_types: form.offers_free_intro ? form.free_intro_types : [],
          free_intro_duration_minutes:
            form.offers_free_intro && form.free_intro_duration_minutes
              ? Number(form.free_intro_duration_minutes)
              : null,
          professional_memberships: form.professional_memberships
            .filter((item) => item.organization_name.trim())
            .map((item) => ({
              organization_name: item.organization_name,
              membership_start_date: item.membership_start_date || null,
              member_since: item.membership_start_date
                ? Number(item.membership_start_date.slice(0, 4))
                : item.member_since
                  ? Number(item.member_since)
                  : null,
            })),
          service_arrangements: form.service_arrangements
            .filter((item) => item.organization_name.trim())
            .map((item) => ({
              organization_name: item.organization_name,
              note: item.note || null,
            })),
          publish,
        },
      }),
    onSuccess: (res, publish) => {
      if (res.missing && res.missing.length > 0) {
        setMissing(res.missing);
        toast.error("לא ניתן לפרסם — יש להשלים שדות חובה");
        return;
      }
      setMissing(null);
      toast.success(publish ? "הפרופיל פורסם בהצלחה" : "הפרופיל נשמר.");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-account"] });
    },
    onError: (e: Error) => toast.error(friendlyErrorMessage(e)),
  });

  const visibilityMutation = useMutation({
    mutationFn: (visible: boolean) => setVisibilityFn({ data: { visible } }),
    onSuccess: (result) => {
      toast.success(result.visibility === "visible" ? "הפרופיל הופעל מחדש." : "הפרופיל הוקפא ואינו גלוי כעת.");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-account"] });
    },
    onError: (error: Error) => toast.error(friendlyErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProfileFn({ data: { confirmation: "מחיקת הפרופיל לצמיתות" } }),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/account");
    },
    onError: (error: Error) => toast.error(friendlyErrorMessage(error)),
  });

  if (profile.isLoading || options.isLoading || !initialized) {
    return (
      <div className="min-h-screen bg-brand-soft/50">
        <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">טוען…</div>
      </div>
    );
  }

  const status = profile.data?.profile_status ?? "draft";
  const isEdit = !!profile.data;

  // Match database rows by their stable language code, while continuing to
  // submit UUIDs to therapist_languages through language_ids.
  const orderedLanguages = orderCanonicalLanguages(options.data?.languages ?? []);

  const hasPhysicalLocation = form.locations.some((location) => location.city.trim().length > 0);
  const emailInvalid = form.email.trim().length > 0 && !isValidEmailInput(form.email);
  const phoneInvalid = form.phone.trim().length > 0 && !isValidPhoneInput(form.phone);
  const publishMissing =
    form.full_name.trim().length < 2 ||
    !form.gender ||
    !form.professional_title.trim() ||
    form.profession_ids.length === 0 ||
    form.years_experience.trim() === "" ||
    form.full_description.trim().length < DESCRIPTION_MIN ||
    form.language_ids.length === 0 ||
    form.population_ids.length === 0 ||
    !form.email.trim() ||
    emailInvalid ||
    !form.phone.trim() ||
    phoneInvalid ||
    (form.home_visit_available && form.home_visit_regions.length === 0) ||
    (!hasPhysicalLocation && !form.online_available && !form.home_visit_available);

  const previewData = buildPreviewViewData(form, options.data, profile.data);

  return (
    <div className="min-h-screen bg-brand-soft/50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {isEdit ? "עריכת פרופיל מטפל" : "יצירת פרופיל מטפל חדש"}
              </h1>
              <p className="mt-1 text-base text-muted-foreground">
                ניתן לשמור את הפרופיל כטיוטה ולהמשיך לערוך אותו בהמשך. הפרופיל יופיע בחיפוש הציבורי רק לאחר פרסום.
              </p>
            </div>
            <StatusBadge status={status} />
          </div>
        </div>

        {missing && missing.length > 0 && (
          <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            לא ניתן לפרסם את הפרופיל עדיין. יש להשלים את השדות הבאים:{" "}
            <span className="font-medium">{missing.join(", ")}</span>
          </div>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <main className="grid min-w-0 gap-8">
            <FormArea
              number="1"
              title="פרטים אישיים"
              description="המידע הראשוני שיופיע לצד שמכם ויעזור למטופלים להכיר אתכם בקצרה."
            >
              <Section title="היכרות ופרטים בסיסיים">
                <div className="grid gap-5 md:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]">
                  <Field label="תמונה">
                    <TherapistImageUpload
                      therapistId={profile.data?.id ?? null}
                      value={form.image_url || null}
                      onChange={(url) => setForm({ ...form, image_url: url ?? "" })}
                      gender={form.gender}
                    />
                  </Field>

                  <div className="grid min-w-0 gap-4">
                    <Field label="שם מלא *">
                      <Input
                        value={form.full_name}
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        maxLength={120}
                        className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                      />
                    </Field>

                    <Field label="מין *">
                      <SelectionGrid
                        items={
                          [
                            { id: "male", label: "זכר" },
                            { id: "female", label: "נקבה" },
                            { id: "unspecified", label: "ללא" },
                          ] as { id: Gender; label: string }[]
                        }
                        selected={form.gender ? [form.gender] : []}
                        onChange={(ids) => setForm({ ...form, gender: (ids[0] as Gender | undefined) ?? "" })}
                        multiple={false}
                        columns="threeAlways"
                        hint="יש לבחור אפשרות אחת."
                        showCount={false}
                      />
                    </Field>

                    <Field label="כותרת מקצועית *">
                      <Input
                        value={form.professional_title}
                        onChange={(e) => setForm({ ...form, professional_title: e.target.value })}
                        placeholder="לדוגמה: פסיכולוגית קלינית מומחית"
                        maxLength={160}
                        className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                      />
                    </Field>

                    <Field label="משפט היכרות קצר">
                      <Input
                        value={form.short_intro}
                        onChange={(e) => setForm({ ...form, short_intro: e.target.value })}
                        placeholder="לדוגמה: פסיכולוגית קלינית המתמחה בטיפול בחרדה, משברי חיים וקשיים במערכות יחסים"
                        className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                      />
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        הציגו את עצמכם במשפט אחד שיופיע בחלק העליון של הפרופיל.
                      </p>
                    </Field>
                  </div>
                </div>
              </Section>
            </FormArea>

            <FormArea
              number="2"
              title="הפרופיל המקצועי"
              description="ספרו על ההכשרה, הניסיון, תחומי העיסוק ודרך העבודה שלכם."
            >
              <Section title="מקצוע וניסיון">
                <ProfessionSelector
                  professions={(options.data?.professions ?? []) as ProfessionOption[]}
                  selected={form.profession_ids}
                  onChange={(ids) => setForm({ ...form, profession_ids: ids })}
                  yearsExperience={form.years_experience}
                  onYearsExperienceChange={(value) => setForm({ ...form, years_experience: value })}
                />
              </Section>

              <Section title="קצת עליי *" action={<DescriptionHelpDialog />}>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    כתבו תיאור אישי ומקצועי של עצמכם, של דרך העבודה והניסיון שלכם. פרטו באילו מצבים וקשיים אתם מסייעים,
                    עם אילו אוכלוסיות אתם עובדים ובאילו תחומים צברתם ניסיון. תיאור מדויק ומפורט יסייע להציג את הפרופיל
                    שלכם לאנשים שמחפשים מענה המתאים לניסיון ולתחומי הטיפול שלכם.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    מומלץ להימנע מניסוחים כלליים כמו "ליווי בתהליכי שינוי” או "טיפול בקשיים רגשיים”, ולפרט ככל האפשר מהם
                    המצבים שבהם אתם מטפלים.
                  </p>
                </div>
                <textarea
                  value={form.full_description}
                  onChange={(e) => setForm({ ...form, full_description: e.target.value })}
                  maxLength={DESCRIPTION_MAX}
                  rows={9}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-relaxed transition-colors focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  placeholder="לדוגמא: אני עובד סוציאלי קליני בעל ניסיון בטיפול במבוגרים ובמתבגרים. אני מסייע לאנשים המתמודדים עם חרדה וחרדה חברתית, קשיי שינה על רקע לחץ, טראומה, פרידה ומשברי חיים, וכן עם קשיים בוויסות רגשי ובתפקוד בעבודה או במערכות יחסים. אני עובד בגישה אינטגרטיבית ומאמין בקשר טיפולי בטוח שמאפשר התבוננות, התמודדות ושינוי."
                />
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {form.full_description.trim().length < DESCRIPTION_MIN
                      ? `מומלץ לפחות ${DESCRIPTION_MIN} תווים לתיאור מובן`
                      : "אורך תיאור טוב"}
                  </span>
                  <span>
                    {form.full_description.length} / {DESCRIPTION_MAX}
                  </span>
                </div>
                <SemanticFeedbackPanel description={form.full_description} />
              </Section>

              <Section title="גישות ושיטות טיפוליות">
                <ModalitySelector
                  modalities={options.data?.modalities ?? []}
                  selected={form.modality_ids}
                  onChange={(ids) => setForm({ ...form, modality_ids: ids })}
                />
              </Section>

              <Section title="השכלה, הכשרה וניסיון מקצועי">
                <p className="text-sm text-muted-foreground">
                  פרטו על תארים אקדמיים, הכשרות מקצועיות, הסמכות, ניסיון תעסוקתי, מקומות עבודה ורקע רלוונטי.
                </p>
                <textarea
                  value={form.background}
                  onChange={(e) => setForm({ ...form, background: e.target.value })}
                  maxLength={4000}
                  rows={6}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm leading-relaxed transition-colors focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  placeholder="לדוגמה: תואר שני בעבודה סוציאלית קלינית מאוניברסיטת תל אביב, הכשרה בטיפול דינמי, ניסיון של 8 שנים במרפאה ציבורית ובקליניקה פרטית."
                />
                <TherapistCredentialPanel
                  therapistId={profile.data?.id ?? null}
                  professions={options.data?.professions ?? []}
                  credential={profile.data?.credential ?? null}
                />
              </Section>

              <Section title="איגודים מקצועיים">
                <p className="text-sm text-muted-foreground">המידע מבוסס על הצהרה עצמית ומיועד להצגה בפרופיל בלבד.</p>
                <MembershipListEditor
                  items={form.professional_memberships}
                  onChange={(professional_memberships) => setForm({ ...form, professional_memberships })}
                />
              </Section>
            </FormArea>

            <FormArea
              number="3"
              title="פרטי הטיפול"
              description="הגדירו למי הטיפול מתאים, היכן ובאילו שפות הוא ניתן וכיצד ניתן ליצור אתכם קשר."
            >
              <Section title="שפות הטיפול *">
                <SelectionGrid
                  items={orderedLanguages.map((l) => ({ id: l.id, label: l.name }))}
                  selected={form.language_ids}
                  onChange={(ids) => setForm({ ...form, language_ids: ids })}
                  columns="four"
                  hint="סמנו את כל השפות שבהן ניתן לקבל מכם טיפול."
                />
              </Section>

              <Section title="למי מיועד הטיפול? *">
                <SelectionGrid
                  items={(options.data?.populations ?? []).map((p) => ({
                    id: p.id,
                    label: p.name,
                  }))}
                  selected={form.population_ids}
                  onChange={(ids) => setForm({ ...form, population_ids: ids })}
                  columns="four"
                  hint="סמנו את כל האוכלוסיות שעבורן אתם מציעים טיפול."
                />
              </Section>

              <Section title="מסגרת הטיפול">
                <SelectionGrid
                  items={(options.data?.therapy_formats ?? []).map((item) => ({
                    id: item.id,
                    label: item.name_he,
                  }))}
                  selected={form.therapy_format_ids}
                  onChange={(ids) => setForm({ ...form, therapy_format_ids: ids })}
                  columns="three"
                  hint="ניתן לבחור יותר ממסגרת טיפול אחת."
                />
              </Section>

              <Section title="מאפייני הטיפול">
                <div className="space-y-3">
                  <CheckCard
                    checked={form.lgbtq_affirming}
                    onChange={(checked) => setForm({ ...form, lgbtq_affirming: checked })}
                    title="טיפול מותאם לקהילה הגאה"
                    description="הצהרה עצמית שתוצג כתגית בפרופיל. אינה מהווה הסמכה מקצועית מאומתת."
                  />
                  <CheckCard
                    checked={form.offers_free_intro}
                    onChange={(checked) =>
                      setForm({
                        ...form,
                        offers_free_intro: checked,
                        free_intro_types: checked ? form.free_intro_types : [],
                        free_intro_duration_minutes: checked ? form.free_intro_duration_minutes : "",
                      })
                    }
                    title="פגישת או שיחת היכרות ללא תשלום"
                    description="ציינו כיצד ניתן לקיים את ההיכרות וכמה זמן היא נמשכת."
                  />
                  {form.offers_free_intro && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-4">
                      <SelectionGrid
                        items={[
                          { id: "phone", label: "טלפון" },
                          { id: "video", label: "וידאו" },
                          { id: "in_person", label: "פגישה בקליניקה" },
                        ]}
                        selected={form.free_intro_types}
                        onChange={(ids) => setForm({ ...form, free_intro_types: ids })}
                        columns="three"
                        showCount={false}
                      />
                      <Field label="משך ההיכרות בדקות">
                        <Input
                          type="number"
                          min={5}
                          max={120}
                          value={form.free_intro_duration_minutes}
                          onChange={(e) => setForm({ ...form, free_intro_duration_minutes: e.target.value })}
                          className="max-w-40 bg-white"
                        />
                      </Field>
                    </div>
                  )}
                </div>
                <div className="mt-6 border-t border-border pt-5">
                  <StringListEditor
                    title="הסדרים עם גופים"
                    placeholder="לדוגמה: קופת חולים או גוף ציבורי"
                    items={form.service_arrangements.map((item) => item.organization_name)}
                    onChange={(items) =>
                      setForm({
                        ...form,
                        service_arrangements: items.map((organization_name, index) => ({
                          organization_name,
                          note: form.service_arrangements[index]?.note ?? "",
                        })),
                      })
                    }
                  />
                </div>
              </Section>

              <Section title="מיקום הטיפול *">
                <p className="text-sm text-muted-foreground">
                  בחרו את היישוב שבו אתם מקבלים מטופלים. האזור יתעדכן אוטומטית. ניתן להוסיף עד שלושה מיקומים פיזיים,
                  ולהציע גם טיפול אונליין או ביקורי בית.
                </p>

                {options.data?.locality_options_error && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    רשימת היישובים הרשמית לא נטענה כרגע. נסו לרענן את העמוד לפני שמירת מיקום חדש.
                  </div>
                )}

                <div className="space-y-4">
                  {form.locations.map((location, index) => {
                    const selectedElsewhere = form.locations
                      .filter((_, locationIndex) => locationIndex !== index)
                      .map((item) => item.city)
                      .filter(Boolean);

                    return (
                      <div key={index} className="rounded-xl border border-border bg-white/60 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h4 className="text-base font-semibold text-foreground">מיקום {index + 1}</h4>
                          {index > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  locations: current.locations.filter((_, locationIndex) => locationIndex !== index),
                                }))
                              }
                            >
                              הסרת מיקום
                            </Button>
                          )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="יישוב">
                            <LocalityCombobox
                              localities={options.data?.localities ?? []}
                              value={location.city}
                              disabledValues={selectedElsewhere}
                              unavailable={Boolean(options.data?.locality_options_error)}
                              onChange={(selected) =>
                                setForm((current) => ({
                                  ...current,
                                  locations: current.locations.map((item, locationIndex) =>
                                    locationIndex === index
                                      ? selected
                                        ? { ...item, city: selected.name, region: selected.region }
                                        : blankLocation()
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </Field>

                          <Field label="אזור">
                            <Input
                              value={location.region}
                              readOnly
                              placeholder="יתעדכן אוטומטית לאחר בחירת יישוב"
                              className="cursor-default bg-muted/40 text-foreground"
                            />
                          </Field>
                        </div>

                        <Field label="כתובת מלאה">
                          <Input
                            value={location.address}
                            onChange={(e) =>
                              setForm((current) => ({
                                ...current,
                                locations: current.locations.map((item, locationIndex) =>
                                  locationIndex === index ? { ...item, address: e.target.value } : item,
                                ),
                              }))
                            }
                            maxLength={200}
                            placeholder="רחוב ומספר (אופציונלי)"
                            className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                          />
                        </Field>

                        {location.city && (
                          <div className="mt-4 border-t border-border pt-4">
                            <Field label="נגישות הקליניקה">
                              <SelectionGrid
                                items={[
                                  { id: "accessible", label: "נגישה" },
                                  { id: "partially_accessible", label: "נגישה חלקית" },
                                  { id: "not_accessible", label: "אינה נגישה" },
                                  { id: "unknown", label: "לא ידוע" },
                                ]}
                                selected={[location.accessibility_status]}
                                onChange={(ids) =>
                                  setForm((current) => ({
                                    ...current,
                                    locations: current.locations.map((item, locationIndex) =>
                                      locationIndex === index
                                        ? {
                                            ...item,
                                            accessibility_status: (ids[0] ??
                                              "unknown") as FormLocation["accessibility_status"],
                                            accessibility_features:
                                              ids[0] === "accessible" || ids[0] === "partially_accessible"
                                                ? item.accessibility_features
                                                : [],
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                multiple={false}
                                columns="four"
                                showCount={false}
                              />
                            </Field>
                            {(location.accessibility_status === "accessible" ||
                              location.accessibility_status === "partially_accessible") && (
                              <SelectionGrid
                                items={ACCESSIBILITY_FEATURES}
                                selected={location.accessibility_features}
                                onChange={(ids) =>
                                  setForm((current) => ({
                                    ...current,
                                    locations: current.locations.map((item, locationIndex) =>
                                      locationIndex === index ? { ...item, accessibility_features: ids } : item,
                                    ),
                                  }))
                                }
                                columns="three"
                                hint="סמנו את מאפייני הנגישות הקיימים במקום."
                              />
                            )}
                            <Field label="מידע נוסף על הנגישות">
                              <Input
                                value={location.accessibility_note}
                                maxLength={500}
                                onChange={(e) =>
                                  setForm((current) => ({
                                    ...current,
                                    locations: current.locations.map((item, locationIndex) =>
                                      locationIndex === index ? { ...item, accessibility_note: e.target.value } : item,
                                    ),
                                  }))
                                }
                                className="bg-white"
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {form.locations.length < MAX_PHYSICAL_LOCATIONS && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        locations: [...current.locations, blankLocation()],
                      }))
                    }
                  >
                    + הוספת מיקום נוסף
                  </Button>
                )}

                <div className="space-y-3 border-t border-border pt-5">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white/60 p-4 transition-colors hover:border-brand/50">
                    <Checkbox
                      checked={form.online_available}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, online_available: checked === true }))
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">אני מציע/ה גם טיפול אונליין</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        פגישות טיפול מרחוק באמצעות שיחת וידאו.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white/60 p-4 transition-colors hover:border-brand/50">
                    <Checkbox
                      checked={form.home_visit_available}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          home_visit_available: checked === true,
                          home_visit_regions: checked === true ? current.home_visit_regions : [],
                        }))
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">אני מציע/ה גם ביקורי בית</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        מפגשים בבית המטופל באזורים שתבחרו.
                      </span>
                    </span>
                  </label>

                  {form.home_visit_available && (
                    <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-4">
                      <h4 className="text-base font-semibold text-foreground">אזורי ביקורי הבית *</h4>
                      <p className="mt-1 text-sm text-muted-foreground">ניתן לבחור יותר מאזור אחד.</p>
                      <div className="mt-3">
                        <SelectionGrid
                          items={PRODUCT_REGIONS.map((region) => ({ id: region, label: region }))}
                          selected={form.home_visit_regions}
                          onChange={(ids) =>
                            setForm((current) => ({
                              ...current,
                              home_visit_regions: ids as ProductRegion[],
                            }))
                          }
                          columns="four"
                          showCount={false}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  לפרסום הפרופיל יש להגדיר לפחות מיקום פיזי אחד, טיפול אונליין או ביקורי בית עם אזור שירות.
                </p>
              </Section>

              <Section title="פרטי התקשרות">
                <p className="text-sm text-muted-foreground">
                  פרטים אלה ישמשו ליצירת קשר בנוגע לפניות שתקבלו דרך Tipulinks.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="אימייל לקבלת פניות *">
                    <Input
                      dir="ltr"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      maxLength={160}
                      aria-invalid={emailInvalid}
                      className={`bg-white text-left transition-colors focus:border-brand focus:ring-brand/30 ${
                        emailInvalid ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""
                      }`}
                    />
                    {emailInvalid && <p className="mt-1.5 text-sm text-destructive">נא להזין כתובת אימייל תקינה.</p>}
                  </Field>

                  <Field label="טלפון לקבלת פניות *">
                    <Input
                      dir="ltr"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="050-1234567"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      maxLength={40}
                      aria-invalid={phoneInvalid}
                      className={`bg-white text-left transition-colors focus:border-brand focus:ring-brand/30 ${
                        phoneInvalid ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""
                      }`}
                    />
                    <p className={`mt-1.5 text-sm ${phoneInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                      {phoneInvalid
                        ? "נא להזין מספר טלפון תקין."
                        : "אפשר להזין מספר ישראלי עם רווחים או מקפים, או מספר בינלאומי שמתחיל ב־+."}
                    </p>
                  </Field>
                </div>
              </Section>
            </FormArea>

            <div className="lg:hidden">
              <ProfileActions
                status={status}
                isPending={mutation.isPending}
                publishMissing={publishMissing}
                onPreview={() => setPreviewOpen(true)}
                onSaveDraft={() => mutation.mutate(false)}
                onPublish={() => mutation.mutate(true)}
                visibility={profile.data?.visibility ?? "hidden"}
                canReactivate={status === "published"}
                visibilityPending={visibilityMutation.isPending}
                onVisibilityChange={(visible) => visibilityMutation.mutate(visible)}
              />
            </div>
          </main>

          <aside className="sticky top-24 hidden h-fit self-start lg:block">
            <ProfileActions
              status={status}
              isPending={mutation.isPending}
              publishMissing={publishMissing}
              onPreview={() => setPreviewOpen(true)}
              onSaveDraft={() => mutation.mutate(false)}
              onPublish={() => mutation.mutate(true)}
              visibility={profile.data?.visibility ?? "hidden"}
              canReactivate={status === "published"}
              visibilityPending={visibilityMutation.isPending}
              onVisibilityChange={(visible) => visibilityMutation.mutate(visible)}
            />
          </aside>
        </div>

        {isEdit && (
          <div className="mt-10">
            <DeleteProfilePanel pending={deleteMutation.isPending} onConfirm={() => deleteMutation.mutate()} />
          </div>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          dir="rtl"
          className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]"
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-right sm:px-6">
            <DialogTitle>תצוגה מקדימה של הפרופיל</DialogTitle>
            <DialogDescription>כך הפרופיל יוצג למבקרים. שינויים שלא שמרתם מוצגים כאן בלבד.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-brand-soft/50 p-2 sm:p-6">
            <div className="mx-auto max-w-6xl">
              <TherapistProfileView therapist={previewData} interactive={false} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type SelectionItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

function CheckCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white/60 p-4 transition-colors hover:border-brand/50">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5 shrink-0" />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function StringListEditor({
  title,
  placeholder,
  items,
  onChange,
}: {
  title: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={item}
              maxLength={160}
              placeholder={placeholder}
              onChange={(e) =>
                onChange(items.map((value, itemIndex) => (itemIndex === index ? e.target.value : value)))
              }
              className="bg-white"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              הסרה
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => onChange([...items, ""])}>
          + הוספה
        </Button>
      </div>
    </div>
  );
}

type MembershipEditorItem = {
  organization_name: string;
  membership_start_date: string;
  member_since: string;
};

function MembershipListEditor({
  items,
  onChange,
}: {
  items: MembershipEditorItem[];
  onChange: (items: MembershipEditorItem[]) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-foreground">חברות באיגודים מקצועיים</h3>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-border bg-white/60 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-end">
              <label className="text-sm font-medium">
                שם האיגוד או האגודה
                <Input
                  value={item.organization_name}
                  maxLength={160}
                  placeholder="שם האיגוד או האגודה"
                  onChange={(event) =>
                    onChange(
                      items.map((value, itemIndex) =>
                        itemIndex === index ? { ...value, organization_name: event.target.value } : value,
                      ),
                    )
                  }
                  className="mt-1.5 bg-white"
                />
              </label>
              <label className="text-sm font-medium">
                תאריך תחילת החברות
                <Input
                  type="date"
                  value={item.membership_start_date}
                  onChange={(event) =>
                    onChange(
                      items.map((value, itemIndex) =>
                        itemIndex === index ? { ...value, membership_start_date: event.target.value } : value,
                      ),
                    )
                  }
                  className="mt-1.5 bg-white"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              >
                הסרה
              </Button>
            </div>
            {!item.membership_start_date && item.member_since && (
              <p className="mt-2 text-xs text-muted-foreground">
                ברשומה הישנה שמורה שנת התחלה: {item.member_since}. ניתן לבחור תאריך מלא כדי לעדכן אותה.
              </p>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...items, { organization_name: "", membership_start_date: "", member_since: "" }])}
        >
          + הוספת חברות באיגוד
        </Button>
      </div>
    </div>
  );
}

type SelectionGridProps = {
  items: SelectionItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  columns?: "one" | "two" | "three" | "threeAlways" | "four";
  hint?: string;
  showCount?: boolean;
  emptyMessage?: string;
};

function FormArea({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-start gap-3 px-1">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
        >
          {number}
        </span>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-base text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function ProfileActions({
  status,
  isPending,
  publishMissing,
  onPreview,
  onSaveDraft,
  onPublish,
  visibility,
  canReactivate,
  visibilityPending,
  onVisibilityChange,
}: {
  status: "draft" | "completed" | "published";
  isPending: boolean;
  publishMissing: boolean;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  visibility: "visible" | "hidden";
  canReactivate: boolean;
  visibilityPending: boolean;
  onVisibilityChange: (visible: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">שמירה ופרסום</h2>
        <StatusBadge status={status} />
      </div>

      {status === "published" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span
              className={`h-2.5 w-2.5 rounded-full ${visibility === "visible" ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            {visibility === "visible" ? "הפרופיל פעיל וגלוי" : "הפרופיל מוקפא ואינו גלוי"}
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={visibilityPending}
            onClick={() => onVisibilityChange(visibility !== "visible")}
            className="mt-3 w-full"
          >
            {visibilityPending ? "מעדכן…" : visibility === "visible" ? "הקפאת הפרופיל" : "הפעלת הפרופיל מחדש"}
          </Button>
        </div>
      )}

      <div
        className={`mt-4 rounded-xl border p-3 text-sm leading-relaxed ${
          publishMissing
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {publishMissing
          ? "הפרופיל עדיין אינו מוכן לפרסום. ניתן לשמור טיוטה ולהשלים בהמשך."
          : "כל שדות החובה הושלמו. ניתן לפרסם את הפרופיל."}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button variant="outline" onClick={onPreview} className="w-full">
          תצוגה מקדימה
        </Button>
        <Button variant="outline" disabled={isPending} onClick={onSaveDraft} className="w-full">
          {isPending ? "מתבצעת שמירה…" : "שמירת פרופיל"}
        </Button>
        <Button
          disabled={isPending || publishMissing}
          title={publishMissing ? "יש להשלים את כל שדות החובה כדי לפרסם" : undefined}
          onClick={onPublish}
          className="w-full"
        >
          {isPending ? "מתבצע פרסום…" : "פרסום פרופיל"}
        </Button>
      </div>

      <Link to="/account" className="mt-4 block text-center text-xs text-muted-foreground underline">
        חזרה לחשבון
      </Link>
    </div>
  );
}

function DeleteProfilePanel({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const phrase = "מחיקת הפרופיל לצמיתות";

  function close(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen && !pending) {
      setAcknowledged(false);
      setConfirmation("");
    }
  }

  return (
    <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-destructive">מחיקת הפרופיל לצמיתות</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        המחיקה תסיר לצמיתות את הפרופיל, המסמכים, המיקומים וכל המידע המקצועי שנשמר בו. לא ניתן לבטל את הפעולה או לשחזר את
        הפרופיל לאחר מכן.
      </p>
      <Button type="button" variant="destructive" className="mt-4" onClick={() => setOpen(true)}>
        מחיקת הפרופיל
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>אישור מחיקה לצמיתות</DialogTitle>
            <DialogDescription>זהו השלב האחרון. לאחר המחיקה לא תהיה אפשרות שחזור.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} />
              <span className="text-sm text-foreground">ברור לי שהמחיקה היא לצמיתות ולא ניתן לשחזר את הפרופיל.</span>
            </label>
            <Field label={`כדי לאשר, הקלידו: ${phrase}`}>
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
                ביטול
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || !acknowledged || confirmation !== phrase}
                onClick={onConfirm}
              >
                {pending ? "הפרופיל נמחק…" : "כן, מחיקת הפרופיל לצמיתות"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-foreground">{label}</div>
      {children}
    </div>
  );
}

function ProfessionSelector({
  professions,
  selected,
  onChange,
  yearsExperience,
  onYearsExperienceChange,
}: {
  professions: ProfessionOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  yearsExperience: string;
  onYearsExperienceChange: (value: string) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const matchedProfessionIds = new Set<string>();

    const grouped = PROFESSION_CATEGORIES.map((category) => {
      const categoryNames = new Set(category.professionNames.map(normalizeProfessionName));
      const items = professions.filter((profession) => categoryNames.has(normalizeProfessionName(profession.name_he)));
      items.forEach((profession) => matchedProfessionIds.add(profession.id));
      return { ...category, items };
    });

    const unmatched = professions.filter((profession) => !matchedProfessionIds.has(profession.id));
    if (unmatched.length === 0) return grouped;

    return [
      ...grouped,
      {
        id: "additional-professions",
        title: "מקצועות נוספים",
        professionNames: [] as readonly string[],
        items: unmatched,
      },
    ];
  }, [professions]);

  type CategoryWithItems = (typeof categories)[number];

  const selectedProfessions = professions.filter((profession) => selected.includes(profession.id));
  const totalSelectedLabel =
    selected.length === 0
      ? "טרם נבחרו מקצועות"
      : selected.length === 1
        ? "נבחר מקצוע אחד"
        : `נבחרו ${selected.length} מקצועות`;

  const toggleProfession = (professionId: string) => {
    onChange(
      selected.includes(professionId)
        ? selected.filter((selectedId) => selectedId !== professionId)
        : [...selected, professionId],
    );
  };

  const selectedOtherProfession = professions.some((profession) => {
    const normalizedName = normalizeProfessionName(profession.name_he);
    return (
      selected.includes(profession.id) &&
      (normalizedName === "מקצוע טיפולי אחר" || normalizedName === "תחום טיפולי אחר")
    );
  });

  if (professions.length === 0) {
    return <p className="text-xs text-muted-foreground">אין מקצועות זמינים לבחירה.</p>;
  }

  const renderCategoryCard = (category: CategoryWithItems, layoutId: string) => {
    const isOpen = activeCategoryId === category.id;
    const selectedCount = category.items.filter((profession) => selected.includes(profession.id)).length;
    const isEmpty = category.items.length === 0;

    return (
      <button
        key={category.id}
        type="button"
        aria-expanded={isOpen}
        aria-controls={`profession-category-${layoutId}-${category.id}`}
        disabled={isEmpty}
        onClick={() => setActiveCategoryId(isOpen ? null : category.id)}
        className={`group flex h-14 items-center justify-between gap-2 overflow-hidden rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:h-12 ${
          isOpen
            ? "border-brand bg-brand/10 shadow-sm ring-1 ring-brand/20"
            : selectedCount > 0
              ? "border-brand/50 bg-brand/5 hover:border-brand/70"
              : "border-brand/30 bg-brand-soft hover:border-brand/60"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-start gap-1">
          <span className="min-w-0 flex-1 line-clamp-2 text-base font-semibold leading-snug text-foreground md:line-clamp-1">
            {category.title}
          </span>

          {selectedCount > 0 && (
            <span className="mt-0.5 shrink-0 whitespace-nowrap text-sm font-semibold leading-snug text-brand">
              ({selectedCount})
            </span>
          )}
        </span>

        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition ${
            selectedCount > 0
              ? "border-brand bg-brand text-white"
              : "border-brand/40 bg-background text-muted-foreground"
          }`}
        >
          {selectedCount > 0 ? "✓" : isOpen ? "−" : "+"}
        </span>
      </button>
    );
  };

  const renderCategoryPanel = (category: CategoryWithItems, layoutId: string) => {
    const categorySelectedCount = category.items.filter((profession) => selected.includes(profession.id)).length;

    return (
      <div
        id={`profession-category-${layoutId}-${category.id}`}
        className="rounded-xl border border-brand/30 bg-background/70 p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">{category.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">בחרו את כל המקצועות הרלוונטיים לפרופיל שלכם.</p>
          </div>
          <span className="text-xs font-medium text-foreground">
            {categorySelectedCount} מתוך {category.items.length} נבחרו
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {category.items.map((profession) => {
            const active = selected.includes(profession.id);
            return (
              <button
                key={profession.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleProfession(profession.id)}
                className={`group flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 ${
                  active
                    ? "border-brand bg-brand/10 text-foreground shadow-sm ring-1 ring-brand/20"
                    : "border-brand/30 bg-brand-soft text-foreground hover:border-brand/60"
                }`}
              >
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{profession.name_he}</span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition ${
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-brand/40 bg-background text-transparent group-hover:border-brand/70"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>

        {selectedOtherProfession && category.id === "emotional-therapy" && (
          <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 p-2.5 text-sm text-muted-foreground">
            אם התחום שלכם אינו מופיע ברשימה, ציינו את ההגדרה המדויקת בשדה „כותרת מקצועית” שבאזור הפרטים האישיים.
          </p>
        )}
      </div>
    );
  };

  const renderCategoryRows = (columns: 2 | 3, layoutId: string) =>
    chunkItems(categories, columns).map((row, rowIndex) => {
      const openCategory = row.find((category) => category.id === activeCategoryId) ?? null;
      const gridColumnsClass = columns === 2 ? "grid-cols-2" : "grid-cols-3";

      return (
        <div key={`${layoutId}-${rowIndex}`}>
          <div className={`grid gap-2 ${gridColumnsClass}`}>
            {row.map((category) => renderCategoryCard(category, `${layoutId}-${rowIndex}`))}
          </div>

          {openCategory && openCategory.items.length > 0 && (
            <>
              <div className={`grid ${gridColumnsClass}`} aria-hidden="true">
                {row.map((category) => (
                  <div key={category.id} className="flex justify-center">
                    {category.id === openCategory.id && <span className="h-3 w-px bg-brand/50" />}
                  </div>
                ))}
              </div>
              {renderCategoryPanel(openCategory, `${layoutId}-${rowIndex}`)}
            </>
          )}
        </div>
      );
    });

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:gap-4">
        <div className="min-w-0 text-right">
          <div className="text-base font-medium text-foreground">מקצועות ותחומי עיסוק *</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            בחרו תחום כדי להציג את המקצועות הכלולים בו. ניתן לבחור כמה מקצועות ומכמה תחומים שונים.
          </p>
        </div>

        <Field label="שנות ניסיון *">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={80}
            value={yearsExperience}
            onChange={(event) => onYearsExperienceChange(event.target.value)}
            className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
          />
        </Field>
      </div>

      {selectedProfessions.length > 0 && (
        <>
          {/* מובייל: התגיות עוטפות את תגית הספירה,
        והשורות הבאות מנצלות את מלוא הרוחב */}
          <div className="mt-3 flow-root md:hidden" aria-label="המקצועות שנבחרו">
            <span className="float-left mb-2 mr-2 inline-flex h-7 items-center rounded-full border border-brand/30 bg-brand/5 px-3 text-xs font-medium text-foreground">
              {totalSelectedLabel}
            </span>

            {selectedProfessions.map((profession) => (
              <button
                key={profession.id}
                type="button"
                onClick={() => toggleProfession(profession.id)}
                className="mb-2 ml-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3 align-top text-xs font-medium text-foreground transition hover:border-brand/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                aria-label={`הסרת ${profession.name_he}`}
              >
                <span>{profession.name_he}</span>

                <span aria-hidden="true" className="text-sm leading-none text-muted-foreground">
                  ×
                </span>
              </button>
            ))}
          </div>

          {/* דסקטופ: תגית הספירה נשארת בקצה השמאלי */}
          <div className="mt-3 hidden items-start gap-2 md:flex" aria-label="המקצועות שנבחרו">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {selectedProfessions.map((profession) => (
                <button
                  key={profession.id}
                  type="button"
                  onClick={() => toggleProfession(profession.id)}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3 text-xs font-medium text-foreground transition hover:border-brand/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  aria-label={`הסרת ${profession.name_he}`}
                >
                  <span>{profession.name_he}</span>

                  <span aria-hidden="true" className="text-sm leading-none text-muted-foreground">
                    ×
                  </span>
                </button>
              ))}
            </div>

            <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-brand/30 bg-brand/5 px-3 text-xs font-medium text-foreground">
              {totalSelectedLabel}
            </span>
          </div>
        </>
      )}
      <div className="mt-4 space-y-3 md:hidden">{renderCategoryRows(2, "mobile")}</div>
      <div className="mt-4 hidden space-y-3 md:block">{renderCategoryRows(3, "desktop")}</div>
    </div>
  );
}

function normalizeLocalitySearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[׳’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function LocalityCombobox({
  localities,
  value,
  disabledValues,
  unavailable,
  onChange,
}: {
  localities: EditorOptions["localities"];
  value: string;
  disabledValues: string[];
  unavailable: boolean;
  onChange: (locality: EditorOptions["localities"][number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const disabledSet = useMemo(() => new Set(disabledValues.map(normalizeLocalitySearch)), [disabledValues]);
  const normalizedQuery = normalizeLocalitySearch(query);

  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return localities
      .filter((locality) => normalizeLocalitySearch(locality.name).includes(normalizedQuery))
      .slice(0, 60);
  }, [localities, normalizedQuery]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={unavailable || localities.length === 0}
          className="w-full justify-between bg-white font-normal"
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {value || (unavailable ? "רשימת היישובים לא זמינה כרגע" : "חיפוש ובחירת יישוב")}
          </span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground">
            ⌄
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="הקלידו שם יישוב..." autoFocus />
          <CommandList>
            {value && (
              <CommandItem
                value="__clear_locality__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                  setQuery("");
                }}
                className="text-muted-foreground"
              >
                ניקוי הבחירה
              </CommandItem>
            )}

            {!normalizedQuery ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                הקלידו את שם היישוב כדי לחפש ברשימה הרשמית.
              </div>
            ) : matches.length === 0 ? (
              <CommandEmpty>לא נמצא יישוב מתאים.</CommandEmpty>
            ) : (
              matches.map((locality) => {
                const alreadySelected = disabledSet.has(normalizeLocalitySearch(locality.name));
                const isSelected = locality.name === value;
                return (
                  <CommandItem
                    key={locality.code}
                    value={`${locality.name} ${locality.code}`}
                    disabled={alreadySelected}
                    onSelect={() => {
                      onChange(locality);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{locality.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{locality.region}</span>
                    {isSelected && <span className="shrink-0 text-brand">✓</span>}
                  </CommandItem>
                );
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ModalitySelector({
  modalities,
  selected,
  onChange,
}: {
  modalities: ModalityOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const matchedIds = new Set<string>();

    const grouped = MODALITY_GROUPS.map((group) => {
      const items = modalities.filter((modality) => modalityGroupForSlug(modality.slug)?.id === group.id);
      items.forEach((modality) => matchedIds.add(modality.id));
      return { ...group, items };
    });

    const unmatched = modalities.filter((modality) => !matchedIds.has(modality.id));
    if (unmatched.length === 0) return grouped;

    return [
      ...grouped,
      {
        id: "additional-modalities",
        title: "גישות נוספות",
        description: "גישות ושיטות נוספות הזמינות במערכת.",
        items: unmatched,
      },
    ];
  }, [modalities]);

  type CategoryWithItems = (typeof categories)[number];

  const selectedModalities = modalities.filter((modality) => selected.includes(modality.id));
  const totalSelectedLabel =
    selected.length === 1 ? "נבחרה גישה אחת" : selected.length > 1 ? `נבחרו ${selected.length} גישות` : "";

  const toggleModality = (modalityId: string) => {
    onChange(
      selected.includes(modalityId)
        ? selected.filter((selectedId) => selectedId !== modalityId)
        : [...selected, modalityId],
    );
  };

  if (modalities.length === 0) {
    return <p className="text-sm text-muted-foreground">אין גישות ושיטות זמינות לבחירה.</p>;
  }

  const renderCategoryCard = (category: CategoryWithItems, layoutId: string) => {
    const isOpen = activeCategoryId === category.id;
    const selectedCount = category.items.filter((modality) => selected.includes(modality.id)).length;
    const isEmpty = category.items.length === 0;

    return (
      <button
        key={category.id}
        type="button"
        aria-expanded={isOpen}
        aria-controls={`modality-category-${layoutId}-${category.id}`}
        disabled={isEmpty}
        onClick={() => setActiveCategoryId(isOpen ? null : category.id)}
        className={`group flex min-h-14 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 md:min-h-12 ${
          isOpen
            ? "border-brand bg-brand/10 shadow-sm ring-1 ring-brand/20"
            : selectedCount > 0
              ? "border-brand/50 bg-brand/5 hover:border-brand/70"
              : "border-brand/30 bg-brand-soft hover:border-brand/60"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-start gap-1">
          <span className="min-w-0 flex-1 line-clamp-2 text-base font-semibold leading-snug text-foreground">
            {category.title}
          </span>

          {selectedCount > 0 && (
            <span className="mt-0.5 shrink-0 whitespace-nowrap text-sm font-semibold leading-snug text-brand">
              ({selectedCount})
            </span>
          )}
        </span>

        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition ${
            selectedCount > 0
              ? "border-brand bg-brand text-white"
              : "border-brand/40 bg-background text-muted-foreground"
          }`}
        >
          {selectedCount > 0 ? "✓" : isOpen ? "−" : "+"}
        </span>
      </button>
    );
  };

  const renderCategoryPanel = (category: CategoryWithItems, layoutId: string) => {
    const selectedCount = category.items.filter((modality) => selected.includes(modality.id)).length;

    return (
      <div
        id={`modality-category-${layoutId}-${category.id}`}
        className="rounded-xl border border-brand/30 bg-background/70 p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="max-w-2xl">
            <h3 className="text-base font-semibold text-foreground">{category.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{category.description}</p>
          </div>
          <span className="text-xs font-medium text-foreground">
            {selectedCount} מתוך {category.items.length} נבחרו
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {category.items.map((modality) => {
            const active = selected.includes(modality.id);

            return (
              <button
                key={modality.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleModality(modality.id)}
                className={`group flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 ${
                  active
                    ? "border-brand bg-brand/10 text-foreground shadow-sm ring-1 ring-brand/20"
                    : "border-brand/30 bg-brand-soft text-foreground hover:border-brand/60"
                }`}
              >
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{modality.name_he}</span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition ${
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-brand/40 bg-background text-transparent group-hover:border-brand/70"
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCategoryRows = (columns: 2 | 3, layoutId: string) =>
    chunkItems(categories, columns).map((row, rowIndex) => {
      const openCategory = row.find((category) => category.id === activeCategoryId) ?? null;
      const gridColumnsClass = columns === 2 ? "grid-cols-2" : "grid-cols-3";

      return (
        <div key={`${layoutId}-${rowIndex}`}>
          <div className={`grid gap-2 ${gridColumnsClass}`}>
            {row.map((category) => renderCategoryCard(category, `${layoutId}-${rowIndex}`))}
          </div>

          {openCategory && openCategory.items.length > 0 && (
            <>
              <div className={`grid ${gridColumnsClass}`} aria-hidden="true">
                {row.map((category) => (
                  <div key={category.id} className="flex justify-center">
                    {category.id === openCategory.id && <span className="h-3 w-px bg-brand/50" />}
                  </div>
                ))}
              </div>
              {renderCategoryPanel(openCategory, `${layoutId}-${rowIndex}`)}
            </>
          )}
        </div>
      );
    });

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        סמנו את הגישות והשיטות שבהן אתם משתמשים במסגרת הטיפול. ניתן לבחור יותר מאפשרות אחת.
      </p>

      {selectedModalities.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="הגישות והשיטות שנבחרו">
          {selectedModalities.map((modality) => (
            <button
              key={modality.id}
              type="button"
              onClick={() => toggleModality(modality.id)}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3 text-xs font-medium text-foreground transition hover:border-brand/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              aria-label={`הסרת ${modality.name_he}`}
            >
              <span>{modality.name_he}</span>
              <span aria-hidden="true" className="text-sm leading-none text-muted-foreground">
                ×
              </span>
            </button>
          ))}

          <span className="inline-flex h-7 items-center rounded-full border border-brand/30 bg-brand/5 px-3 text-xs font-medium text-foreground">
            {totalSelectedLabel}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-3 md:hidden">{renderCategoryRows(2, "modality-mobile")}</div>
      <div className="mt-4 hidden space-y-3 md:block">{renderCategoryRows(3, "modality-desktop")}</div>
    </div>
  );
}

function SelectionGrid({
  items,
  selected,
  onChange,
  multiple = true,
  columns = "four",
  hint,
  showCount = true,
  emptyMessage = "אין אפשרויות זמינות.",
}: SelectionGridProps) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;

  const columnClass = {
    one: "grid-cols-1",
    two: "grid-cols-1 sm:grid-cols-2",
    three: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    threeAlways: "grid-cols-3",
    four: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  }[columns];

  const selectedLabel = selected.length === 1 ? "אפשרות אחת נבחרה" : `${selected.length} אפשרויות נבחרו`;

  return (
    <div>
      {(hint || (showCount && selected.length > 0)) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
          <span className="text-sm">{hint}</span>
          {showCount && selected.length > 0 && (
            <span className="text-xs font-medium text-foreground">{selectedLabel}</span>
          )}
        </div>
      )}

      <div className={`grid gap-2 ${columnClass}`}>
        {items.map((item) => {
          const active = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              disabled={item.disabled}
              onClick={() => {
                if (multiple) {
                  onChange(active ? selected.filter((id) => id !== item.id) : [...selected, item.id]);
                  return;
                }
                if (!active) onChange([item.id]);
              }}
              className={`group relative flex min-h-10 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-brand bg-brand/10 text-foreground shadow-sm ring-1 ring-brand/20"
                  : "border-brand/30 bg-brand-soft text-foreground hover:border-brand/60"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{item.label}</span>
                {item.description && (
                  <span className="mt-1 block text-sm font-normal leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-brand/40 bg-background text-transparent group-hover:border-brand/70"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "draft" | "completed" | "published" }) {
  const map = {
    draft: { l: "טיוטה", c: "bg-muted text-muted-foreground" },
    completed: { l: "מוכן לפרסום", c: "bg-amber-100 text-amber-800" },
    published: { l: "מפורסם", c: "bg-emerald-100 text-emerald-800" },
  } as const;
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${map[status].c}`}>{map[status].l}</span>;
}

/**
 * Convert a raw server error into a short Hebrew message. When the server
 * returned a stringified ZodError (older payloads), extract the first
 * issue's message. Otherwise return the message as-is.
 */
function friendlyErrorMessage(err: Error): string {
  const msg = err?.message ?? "";
  const trimmed = msg.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: string; path?: (string | number)[] }[];
      const first = parsed[0];
      if (first?.path?.[0] === "full_name") {
        return "נא למלא את שדה 'שם מלא' לפני שמירת טיוטה.";
      }
      if (first?.message) return first.message;
    } catch {
      // fall through
    }
    return "לא ניתן לשמור — קלט לא תקין.";
  }
  return msg || "אירעה שגיאה. נסו שוב.";
}

function SemanticFeedbackPanel({ description }: { description: string }) {
  const getFeedbackFn = useServerFn(getSemanticFeedback);
  // Debounce input so we do not thrash the server on every keystroke.
  const [debounced, setDebounced] = useState(description);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(description), 600);
    return () => clearTimeout(t);
  }, [description]);

  const trimmedLen = useMemo(() => debounced.trim().length, [debounced]);
  const enabled = trimmedLen >= 20;
  const query = useQuery({
    queryKey: ["semantic-feedback", debounced.trim()],
    queryFn: () => getFeedbackFn({ data: { description: debounced } }),
    enabled,
    staleTime: 30_000,
  });

  const domains = query.data?.domains ?? [];

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-base font-semibold text-foreground">תחומי טיפול שהמערכת זיהתה בתיאור שלך</h3>
      <p className="mt-1 text-sm text-muted-foreground">המערכת מזהה בתיאור את תחומי הטיפול.</p>
      <div className="mt-3">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">הוסיפו תיאור כדי לראות אילו תחומי טיפול המערכת מזהה.</p>
        ) : query.isFetching && domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">מנתח…</p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">עדיין לא זוהו תחומי טיפול בתיאור.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <li
                key={d.slug}
                className="rounded-full border border-brand/40 bg-brand/5 px-3 py-1 text-xs text-foreground"
              >
                ✓ {d.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DescriptionHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="עזרה: כיצד לכתוב תיאור מקצועי"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted-foreground hover:border-brand hover:text-foreground"
        >
          ?
        </button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>כיצד לכתוב את התיאור?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-foreground">
          <p>כתבו תיאור אישי, טבעי ומקצועי. מומלץ לכלול:</p>
          <ul className="list-disc space-y-1 pr-5 text-muted-foreground">
            <li>קצת עליכם והגישה הטיפולית שלכם</li>
            <li>המצבים, הקשיים וההתמודדויות שאתם מסייעים בהם</li>
            <li>למי אתם עוזרים ואילו אנשים פונים אליכם</li>
          </ul>
          <p className="text-muted-foreground">
            כתבו באופן טבעי וזורם, כך שאנשים יוכלו להבין אם אתם המטפל המתאים עבורם.
          </p>
          <p className="text-muted-foreground">
            הימנעו מרשימות של מילות מפתח. פרטי השכלה, הכשרות והסמכות שייכים לשדה "השכלה, הכשרה וניסיון מקצועי".
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Reference EditorOptions type to keep imports tree-shakable
export type _EditorOptions = EditorOptions;

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TherapistImageUpload } from "@/components/therapist-image-upload";
import { orderCanonicalLanguages } from "@/lib/language-options";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  getEditorOptions,
  getMyProfile,
  getSemanticFeedback,
  saveMyProfile,
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
  primary_city: string;
  primary_region: string;
  primary_address: string;
  online_available: boolean;
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
  primary_city: "",
  primary_region: "",
  primary_address: "",
  online_available: false,
};

type ProfessionOption = {
  id: string;
  name_he: string;
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

function fromProfile(p: ProfileEditorData): FormState {
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
    primary_city: p.primary_city ?? "",
    primary_region: p.primary_region ?? "",
    primary_address: p.primary_address ?? "",
    online_available: p.online_available,
  };
}

function EditorPage() {
  const queryClient = useQueryClient();
  const getProfileFn = useServerFn(getMyProfile);
  const getOptionsFn = useServerFn(getEditorOptions);
  const saveFn = useServerFn(saveMyProfile);

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn() });
  const options = useQuery({ queryKey: ["editor-options"], queryFn: () => getOptionsFn() });

  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialized, setInitialized] = useState(false);
  const [missing, setMissing] = useState<string[] | null>(null);

  useEffect(() => {
    if (!initialized && profile.data) {
      setForm(fromProfile(profile.data));
      setInitialized(true);
    } else if (!initialized && profile.isSuccess && !profile.data) {
      setInitialized(true);
    }
  }, [profile.data, profile.isSuccess, initialized]);

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
          primary_city: form.primary_city || null,
          primary_region: form.primary_region || null,
          primary_address: form.primary_address || null,
          online_available: form.online_available,
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

  const hasCity = form.primary_city.trim().length > 0;
  const publishMissing =
    form.full_name.trim().length < 2 ||
    !form.gender ||
    form.profession_ids.length === 0 ||
    form.full_description.trim().length < DESCRIPTION_MIN ||
    !form.email.trim() ||
    !form.phone.trim() ||
    (!hasCity && !form.online_available);

  return (
    <div className="min-h-screen bg-brand-soft/50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {isEdit ? "עריכת פרופיל מטפל" : "יצירת פרופיל מטפל חדש"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                ניתן לשמור טיוטה בכל שלב. הפרופיל יופיע בחיפוש הציבורי רק לאחר פרסום.
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

                    <Field label="כותרת מקצועית">
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
                      <p className="mt-1.5 text-xs text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
                    כתבו תיאור אישי ומקצועי של עצמכם, של דרך העבודה והניסיון שלכם. פרטו באילו מצבים וקשיים אתם מסייעים,
                    עם אילו אוכלוסיות אתם עובדים ובאילו תחומים צברתם ניסיון. תיאור מדויק ומפורט יסייע להציג את הפרופיל
                    שלכם לאנשים שמחפשים מענה המתאים לניסיון ולתחומי הטיפול שלכם.
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                <SelectionGrid
                  items={(options.data?.modalities ?? []).map((m) => ({ id: m.id, label: m.name_he }))}
                  selected={form.modality_ids}
                  onChange={(ids) => setForm({ ...form, modality_ids: ids })}
                  columns="three"
                  hint="ניתן לבחור כמה שיטות טיפול."
                />
              </Section>

              <Section title="השכלה, הכשרה וניסיון מקצועי">
                <p className="text-xs text-muted-foreground">
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
              </Section>
            </FormArea>

            <FormArea
              number="3"
              title="פרטי הטיפול"
              description="הגדירו למי הטיפול מתאים, היכן ובאילו שפות הוא ניתן וכיצד ניתן ליצור אתכם קשר."
            >
              <Section title="שפות הטיפול">
                <SelectionGrid
                  items={orderedLanguages.map((l) => ({ id: l.id, label: l.name }))}
                  selected={form.language_ids}
                  onChange={(ids) => setForm({ ...form, language_ids: ids })}
                  columns="four"
                  hint="סמנו את כל השפות שבהן ניתן לקבל מכם טיפול."
                />
              </Section>

              <Section title="למי מיועד הטיפול?">
                <SelectionGrid
                  items={(options.data?.populations ?? []).map((p) => ({ id: p.id, label: p.name }))}
                  selected={form.population_ids}
                  onChange={(ids) => setForm({ ...form, population_ids: ids })}
                  columns="four"
                  hint="סמנו את כל האוכלוסיות שעבורן אתם מציעים טיפול."
                />
              </Section>

              <Section title="מיקום הטיפול">
                <p className="text-xs text-muted-foreground">
                  מלאו את פרטי המיקום הפיזי שבו אתם מקבלים מטופלים. ניתן להציע גם טיפול אונליין באזור הבא.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="עיר (מיקום פיזי)">
                    <Input
                      value={form.primary_city}
                      onChange={(e) => setForm({ ...form, primary_city: e.target.value })}
                      placeholder="לדוגמה: תל אביב"
                      maxLength={80}
                      className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                    />
                  </Field>

                  <Field label="אזור">
                    <Input
                      value={form.primary_region}
                      onChange={(e) => setForm({ ...form, primary_region: e.target.value })}
                      maxLength={80}
                      className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                    />
                  </Field>
                </div>

                <Field label="כתובת מלאה">
                  <Input
                    value={form.primary_address}
                    onChange={(e) => setForm({ ...form, primary_address: e.target.value })}
                    maxLength={200}
                    className="bg-white transition-colors focus:border-brand focus:ring-brand/30"
                  />
                </Field>
              </Section>

              <Section title="אופן הטיפול *">
                <p className="text-xs text-muted-foreground">
                  יש למלא מיקום פיזי, לסמן זמינות לטיפול אונליין, או לבחור בשתי האפשרויות.
                </p>

                <Field label="טיפול אונליין">
                  <SelectionGrid
                    items={[
                      {
                        id: "online",
                        label: "אני מציע/ה גם טיפול אונליין",
                        description: "פגישות טיפול מרחוק באמצעות שיחת וידאו",
                      },
                    ]}
                    selected={form.online_available ? ["online"] : []}
                    onChange={(ids) => setForm({ ...form, online_available: ids.includes("online") })}
                    columns="one"
                    hint="ניתן להציע טיפול אונליין בנוסף לטיפול במיקום הפיזי שמילאתם."
                    showCount={false}
                  />
                </Field>
              </Section>

              <Section title="פרטי קשר">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="כתובת אימייל *">
                    <Input
                      dir="ltr"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      maxLength={160}
                      className="bg-white text-left transition-colors focus:border-brand focus:ring-brand/30"
                    />
                  </Field>

                  <Field label="מספר טלפון *">
                    <Input
                      dir="ltr"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      maxLength={40}
                      className="bg-white text-left transition-colors focus:border-brand focus:ring-brand/30"
                    />
                  </Field>
                </div>
              </Section>
            </FormArea>

            <div className="lg:hidden">
              <ProfileActions
                status={status}
                isPending={mutation.isPending}
                publishMissing={publishMissing}
                onSaveDraft={() => mutation.mutate(false)}
                onPublish={() => mutation.mutate(true)}
              />
            </div>
          </main>

          <aside className="sticky top-24 hidden h-fit self-start lg:block">
            <ProfileActions
              status={status}
              isPending={mutation.isPending}
              publishMissing={publishMissing}
              onSaveDraft={() => mutation.mutate(false)}
              onPublish={() => mutation.mutate(true)}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

type SelectionItem = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

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
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
  onSaveDraft,
  onPublish,
}: {
  status: "draft" | "completed" | "published";
  isPending: boolean;
  publishMissing: boolean;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">שמירה ופרסום</h2>
        <StatusBadge status={status} />
      </div>

      <div
        className={`mt-4 rounded-xl border p-3 text-xs leading-relaxed ${
          publishMissing
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        {publishMissing
          ? "הפרופיל עדיין אינו מוכן לפרסום. ניתן לשמור טיוטה ולהמשיך בהמשך."
          : "כל שדות החובה הושלמו. ניתן לפרסם את הפרופיל."}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button variant="outline" disabled={isPending} onClick={onSaveDraft} className="w-full">
          {isPending ? "שומר…" : "שמור טיוטה"}
        </Button>
        <Button
          disabled={isPending || publishMissing}
          title={publishMissing ? "יש להשלים את כל שדות החובה כדי לפרסם" : undefined}
          onClick={onPublish}
          className="w-full"
        >
          {isPending ? "מפרסם…" : "פרסם פרופיל"}
        </Button>
      </div>

      <Link to="/account" className="mt-4 block text-center text-xs text-muted-foreground underline">
        חזרה לחשבון
      </Link>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
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
          <span className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground md:line-clamp-1">
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
            <h3 className="text-sm font-semibold text-foreground">{category.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">בחרו את כל המקצועות הרלוונטיים לפרופיל שלכם.</p>
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
          <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 p-2.5 text-xs text-muted-foreground">
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
          <div className="text-sm font-medium text-foreground">מקצועות ותחומי עיסוק *</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            בחרו תחום כדי להציג את המקצועות הכלולים בו. ניתן לבחור כמה מקצועות ומכמה תחומים שונים.
          </p>
        </div>

        <Field label="שנות ניסיון">
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{hint}</span>
          {showCount && selected.length > 0 && <span className="font-medium text-foreground">{selectedLabel}</span>}
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
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">
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
      <h3 className="text-sm font-semibold text-foreground">תחומי טיפול מרכזיים שעלו מתוך התיאור שלך</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        המערכת מנתחת את התיאור שלך כדי לזהות אילו תחומי טיפול והתמודדויות ניתן להסיק ממנו.
      </p>
      <div className="mt-3">
        {!enabled ? (
          <p className="text-xs text-muted-foreground">הוסיפו תיאור כדי לראות אילו תחומי טיפול המערכת מזהה.</p>
        ) : query.isFetching && domains.length === 0 ? (
          <p className="text-xs text-muted-foreground">מנתח…</p>
        ) : domains.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            עדיין לא זוהו תחומי טיפול. ניתן לשפר את התיאור כדי לעזור למערכת להבין את תחומי הטיפול שלך.
          </p>
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

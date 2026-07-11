import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TherapistImageUpload } from "@/components/therapist-image-upload";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  getEditorOptions,
  getMyProfile,
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

function fromProfile(p: ProfileEditorData): FormState {
  return {
    full_name: p.full_name ?? "",
    gender: (p.gender ?? "") as Gender | "",
    professional_title: p.professional_title ?? "",
    full_description: p.full_description ?? "",
    short_intro: p.short_intro ?? "",
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
      toast.success(publish ? "הפרופיל פורסם בהצלחה" : "השינויים נשמרו בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["therapist-account"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (profile.isLoading || options.isLoading || !initialized) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">טוען…</div>;
  }

  const status = profile.data?.profile_status ?? "draft";
  const isEdit = !!profile.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm">
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

        {missing && missing.length > 0 && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            לא ניתן לפרסם את הפרופיל עדיין. יש להשלים את השדות הבאים:{" "}
            <span className="font-medium">{missing.join(", ")}</span>
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <Section title="מידע בסיסי">
            <Field label="שם מלא *">
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                maxLength={120}
              />
            </Field>
            <Field label="מין *">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { v: "male", l: "זכר" },
                    { v: "female", l: "נקבה" },
                    { v: "unspecified", l: "לא צוין" },
                  ] as { v: Gender; l: string }[]
                ).map((o) => (
                  <Chip key={o.v} active={form.gender === o.v} onClick={() => setForm({ ...form, gender: o.v })}>
                    {o.l}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="קישור לתמונה">
              <TherapistImageUpload
                therapistId={profile.data?.id ?? null}
                value={form.image_url || null}
                onChange={(url) => setForm({ ...form, image_url: url ?? "" })}
                gender={form.gender}
              />
            </Field>
          </Section>

          <Section title="מידע מקצועי">
            <Field label="כותרת מקצועית">
              <Input
                value={form.professional_title}
                onChange={(e) => setForm({ ...form, professional_title: e.target.value })}
                placeholder="לדוגמה: פסיכולוגית קלינית מומחית"
                maxLength={160}
              />
            </Field>
            <Field label="מקצועות *">
              <MultiChips
                items={(options.data?.professions ?? []).map((p) => ({ id: p.id, label: p.name_he }))}
                selected={form.profession_ids}
                onChange={(ids) => setForm({ ...form, profession_ids: ids })}
              />
              <p className="mt-1 text-xs text-muted-foreground">בחרו לפחות מקצוע אחד.</p>
            </Field>
            <Field label="שנות ניסיון">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={80}
                value={form.years_experience}
                onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
                className="max-w-32"
              />
            </Field>
          </Section>

          <Section title="תיאור מקצועי *" action={<DescriptionHelpDialog />}>
            <textarea
              value={form.full_description}
              onChange={(e) => setForm({ ...form, full_description: e.target.value })}
              maxLength={DESCRIPTION_MAX}
              rows={9}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed"
              placeholder="ספרו על עצמכם — למי אתם מסייעים, עם אילו קשיים אתם עובדים, הגישה הטיפולית שלכם והניסיון שלכם."
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
          </Section>

          <Section title="שיטות טיפול">
            <MultiChips
              items={(options.data?.modalities ?? []).map((m) => ({ id: m.id, label: m.name_he }))}
              selected={form.modality_ids}
              onChange={(ids) => setForm({ ...form, modality_ids: ids })}
            />
          </Section>

          <Section title="שפות טיפול">
            <MultiChips
              items={(options.data?.languages ?? []).map((l) => ({ id: l.id, label: l.name }))}
              selected={form.language_ids}
              onChange={(ids) => setForm({ ...form, language_ids: ids })}
            />
          </Section>

          <Section title="אוכלוסיות טיפול">
            <MultiChips
              items={(options.data?.populations ?? []).map((p) => ({ id: p.id, label: p.name }))}
              selected={form.population_ids}
              onChange={(ids) => setForm({ ...form, population_ids: ids })}
            />
          </Section>

          <Section title="מיקום וזמינות *">
            <Field label="עיר (מיקום פיזי)">
              <Input
                value={form.primary_city}
                onChange={(e) => setForm({ ...form, primary_city: e.target.value })}
                placeholder="לדוגמה: תל אביב"
                maxLength={80}
              />
            </Field>
            <Field label="אזור">
              <Input
                value={form.primary_region}
                onChange={(e) => setForm({ ...form, primary_region: e.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="כתובת מלאה">
              <Input
                value={form.primary_address}
                onChange={(e) => setForm({ ...form, primary_address: e.target.value })}
                maxLength={200}
              />
            </Field>
            <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.online_available}
                onChange={(e) => setForm({ ...form, online_available: e.target.checked })}
              />
              זמינות לטיפול אונליין
            </label>
            <p className="mt-1 text-xs text-muted-foreground">יש למלא מיקום פיזי, או לסמן זמינות אונליין, או שניהם.</p>
          </Section>

          <Section title="פרטי קשר">
            <Field label="כתובת אימייל *">
              <Input
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={160}
              />
            </Field>
            <Field label="מספר טלפון *">
              <Input
                dir="ltr"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40}
              />
            </Field>
          </Section>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>
                {mutation.isPending ? "שומר…" : "שמור טיוטה"}
              </Button>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
                {mutation.isPending ? "מפרסם…" : "פרסם פרופיל"}
              </Button>
            </div>
            <Link to="/account" className="text-xs text-muted-foreground underline">
              חזרה לחשבון
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition ${
        active
          ? "border-brand bg-brand/10 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-brand/50"
      }`}
    >
      {children}
    </button>
  );
}

function MultiChips({
  items,
  selected,
  onChange,
}: {
  items: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">אין אפשרויות זמינות.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = selected.includes(it.id);
        return (
          <Chip
            key={it.id}
            active={active}
            onClick={() => onChange(active ? selected.filter((x) => x !== it.id) : [...selected, it.id])}
          >
            {it.label}
          </Chip>
        );
      })}
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
          <DialogTitle>כיצד לכתוב תיאור מקצועי?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-foreground">
          <p>מומלץ לכלול:</p>
          <ul className="list-disc space-y-1 pr-5 text-muted-foreground">
            <li>למי אתם מסייעים</li>
            <li>עם אילו קשיים או מצבים אתם עובדים</li>
            <li>הגישה או שיטות הטיפול שלכם</li>
            <li>ניסיון מקצועי רלוונטי</li>
          </ul>
          <p className="text-muted-foreground">
            כתבו באופן טבעי וברור, כך שאנשים יוכלו להבין האם אתם המטפל המתאים עבורם.
          </p>
          <p className="text-muted-foreground">הימנעו מרשימות ארוכות של מילות מפתח או משפטים כלליים בלי פירוט.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Reference EditorOptions type to keep imports tree-shakable
export type _EditorOptions = EditorOptions;

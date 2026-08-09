import { Link } from "@tanstack/react-router";

import { CtaCallButton } from "@/components/cta-call-button";

export type TherapistProfileViewData = {
  id: string;
  full_name: string;
  professional_title: string | null;
  full_description: string | null;
  years_experience: number | null;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  problems: { id: string; name: string; slug: string }[];
  populations: { slug: string; name: string }[];
  languages: { code: string; name: string }[];
};

export function TherapistProfileView({
  therapist: t,
  interactive = true,
}: {
  therapist: TherapistProfileViewData;
  interactive?: boolean;
}) {
  const subtypes = t.problems.filter((problem) => problem.slug !== "anxiety");

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-card">
      <div className="bg-gradient-to-br from-brand-soft to-surface p-6 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {t.image_url && (
            <img
              src={t.image_url}
              alt={t.full_name || "תמונת פרופיל"}
              className="h-28 w-28 rounded-2xl object-cover ring-2 ring-surface-elevated shadow-card sm:h-32 sm:w-32"
            />
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">
                {t.full_name || "שם המטפל/ת"}
              </h1>
              {t.verified && (
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-primary">
                  מאומת
                </span>
              )}
            </div>
            <p className="mt-1 text-base text-muted-foreground">
              {t.professional_title || "כותרת מקצועית"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground/80">
              {t.city && <span>📍 {t.city}</span>}
              {t.years_experience !== null && (
                <span>
                  <span className="ltr-num">{t.years_experience}</span> שנות ניסיון
                </span>
              )}
              {t.languages.length > 0 && (
                <span>שפות: {t.languages.map((language) => language.name).join(" · ")}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 sm:p-10 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {t.full_description && (
            <section>
              <h2 className="text-lg font-semibold text-foreground">אודות</h2>
              <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-foreground/85">
                {t.full_description}
              </p>
            </section>
          )}

          {subtypes.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground">תחומי טיפול</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {subtypes.map((problem) =>
                  interactive ? (
                    <Link
                      key={problem.id}
                      to="/problems/$slug"
                      params={{ slug: problem.slug }}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-brand/40 hover:bg-brand-soft"
                    >
                      {problem.name}
                    </Link>
                  ) : (
                    <span
                      key={problem.id}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    >
                      {problem.name}
                    </span>
                  ),
                )}
              </div>
            </section>
          )}

          {t.populations.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground">אוכלוסיות</h2>
              <p className="mt-2 text-sm text-foreground/80">
                {t.populations.map((population) => population.name).join(" · ")}
              </p>
            </section>
          )}
        </div>

        <aside className="md:sticky md:top-20 md:self-start">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-card">
            <p className="text-sm text-muted-foreground">יצירת קשר ישיר</p>
            <p className="mt-1 text-sm text-foreground">לשליחת הודעה ישירה</p>
            <div className="mt-4">
              {interactive ? (
                <CtaCallButton
                  therapistId={t.id}
                  therapistName={t.full_name}
                  pageSource="therapist_profile"
                />
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-foreground opacity-60 sm:w-auto"
                >
                  <span aria-hidden>✉️</span>
                  <span>פנו אלי</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}

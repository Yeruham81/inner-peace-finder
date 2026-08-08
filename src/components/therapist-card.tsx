import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { SearchResultCard } from "@/lib/search-result-card";
import { track } from "@/lib/analytics";

function MetaIcon({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-primary">
      {children}
    </span>
  );
}

function additionalLocationsLabel(count: number): string {
  if (count === 1) return "ועוד מיקום אחד";
  return `ועוד ${count} מיקומים`;
}

function experienceSuffix(years: number): string {
  return years === 1 ? "שנת ניסיון" : "שנות ניסיון";
}

export function TherapistCard({
  t,
  rankPosition,
  pageSource,
}: {
  t: SearchResultCard;
  rankPosition?: number;
  pageSource?: string;
}) {
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track("therapist_card_viewed", {
      therapist_id: t.id,
      rank_position: rankPosition ?? null,
      page_source: pageSource ?? null,
      origin: "TherapistCard",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

  const clinicLabel = t.primary_clinic?.city
    ? [
        t.primary_clinic.city,
        t.additional_clinic_count > 0 ? additionalLocationsLabel(t.additional_clinic_count) : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  const fallbackInitial = t.full_name.trim().charAt(0) || "ט";

  return (
    <Link
      to="/therapists/$slug"
      params={{ slug: t.slug }}
      aria-label={`צפייה בפרופיל של ${t.full_name}`}
      className="group flex h-full flex-col rounded-2xl border border-border bg-surface-elevated p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 sm:p-5"
    >
      <div className="flex items-start gap-4">
        {t.image_url ? (
          <img
            src={t.image_url}
            alt={`תמונה של ${t.full_name}`}
            className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-border sm:h-24 sm:w-24"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-2xl font-semibold text-primary ring-1 ring-brand/10 sm:h-24 sm:w-24"
          >
            {fallbackInitial}
          </div>
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold leading-snug text-foreground sm:text-xl">{t.full_name}</h2>
            {t.verified && (
              <span
                title="הפרופיל אומת על ידי Tipulinks"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-primary"
              >
                <span aria-hidden="true">✓</span>
                מאומת
              </span>
            )}
          </div>
          {t.professional_title && (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground sm:text-base">
              {t.professional_title}
            </p>
          )}
        </div>
      </div>

      {t.short_intro && (
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-foreground/85 sm:text-[15px]">{t.short_intro}</p>
      )}

      <ul className="mt-4 space-y-2 text-sm leading-5 text-muted-foreground">
        {clinicLabel && (
          <li className="flex items-start gap-2">
            <MetaIcon>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
            </MetaIcon>
            <span>{clinicLabel}</span>
          </li>
        )}

        {t.years_experience > 0 && (
          <li className="flex items-start gap-2">
            <MetaIcon>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </MetaIcon>
            <span>
              <span className="ltr-num">{t.years_experience}</span> {experienceSuffix(t.years_experience)}
            </span>
          </li>
        )}

        {t.language_names.length > 0 && (
          <li className="flex items-start gap-2">
            <MetaIcon>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3c-2.3 2.5-3.5 5.5-3.5 9S9.7 18.5 12 21" />
              </svg>
            </MetaIcon>
            <span>{t.language_names.join(" · ")}</span>
          </li>
        )}

        {t.home_visit_regions.length > 0 && (
          <li className="flex items-start gap-2">
            <MetaIcon>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
                <path d="m3 11 9-7 9 7" />
                <path d="M5.5 9.5V20h13V9.5M9 20v-6h6v6" />
              </svg>
            </MetaIcon>
            <span>ביקורי בית: {t.home_visit_regions.join(", ")}</span>
          </li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <div className="flex flex-wrap gap-2">
          {t.primary_clinic && (
            <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border">
              קליניקה
            </span>
          )}
          {t.online_available && (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-primary">
              טיפול אונליין
            </span>
          )}
          {t.home_visit_regions.length > 0 && (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-primary">ביקורי בית</span>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
          לפרופיל המלא
          <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
        </span>
      </div>
    </Link>
  );
}

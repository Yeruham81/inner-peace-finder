import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ScoredTherapist } from "@/lib/therapists.functions";
import { track } from "@/lib/analytics";

export function TherapistCard({
  t,
  rankPosition,
  pageSource,
}: {
  t: ScoredTherapist;
  rankPosition?: number;
  pageSource?: string;
}) {
  useEffect(() => {
    track("therapist_card_viewed", {
      therapist_id: t.id,
      rank_position: rankPosition ?? null,
      page_source: pageSource ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);
  return (
    <Link
      to="/therapists/$slug"
      params={{ slug: t.slug }}
      className="group flex gap-4 rounded-2xl border border-border bg-surface-elevated p-4 shadow-card transition-all hover:border-brand/40 hover:-translate-y-0.5"
    >
      <div className="shrink-0">
        {t.image_url ? (
          <img
            src={t.image_url}
            alt={t.full_name}
            className="h-20 w-20 rounded-xl object-cover ring-1 ring-border"
            loading="lazy"
          />
        ) : (
          <div className="h-20 w-20 rounded-xl bg-brand-soft" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground truncate">
            {t.full_name}
          </h3>
          {t.verified && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-primary">
              מאומת
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground truncate">
          {t.professional_title}
        </p>
        {t.short_intro && (
          <p className="mt-2 text-sm text-foreground/80 line-clamp-2">
            {t.short_intro}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>📍 {t.city}</span>
          <span>
            <span className="ltr-num">{t.years_experience}</span> שנות ניסיון
          </span>
          {t.language_names.length > 0 && (
            <span>{t.language_names.join(" · ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  Clock3,
  Home,
  Languages,
  MapPin,
  MessageCircle,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CtaCallButton } from "@/components/cta-call-button";
import {
  accessibilityFeatureLabels,
  clinicAccessibilityLabel,
  freeIntroTypeLabels,
} from "@/lib/profile-display-options";

type ProfileLocationType = "clinic" | "home_visit" | "online" | "hospital" | "other";

export type TherapistProfileViewData = {
  id: string;
  full_name: string;
  professional_title: string | null;
  short_intro: string | null;
  full_description: string | null;
  education_training: string | null;
  professional_experience: string | null;
  years_experience: number | null;
  city: string | null;
  image_url: string | null;
  verified: boolean;
  lgbtq_affirming: boolean;
  offers_free_intro: boolean;
  free_intro_types: string[];
  free_intro_duration_minutes: number | null;
  professions: { slug: string; name: string; is_primary: boolean }[];
  modalities: { slug: string; name: string }[];
  therapy_formats: { slug: string; name: string }[];
  locations: {
    location_type: ProfileLocationType;
    city: string | null;
    region: string | null;
    is_primary: boolean;
    accessibility_status: string;
    accessibility_features: string[];
    accessibility_note: string | null;
  }[];
  professional_memberships: { organization_name: string; member_since: number | null }[];
  service_arrangements: { organization_name: string; note: string | null }[];
  problems: { id: string; name: string; slug: string }[];
  populations: { slug: string; name: string }[];
  languages: { code: string; name: string }[];
};

type TagItem = { key: string; label: string; problemSlug?: string };

const TAG_CLASS =
  "inline-flex max-w-full shrink-0 items-center truncate whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-sm leading-5 text-foreground";

/**
 * Returns the largest number of tags that can be shown in `maxRows`, while
 * reserving room for the exact "+N נוספים" button when some tags are hidden.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function visibleTagCountForRows(
  tagWidths: number[],
  containerWidth: number,
  moreButtonWidths: Record<number, number>,
  maxRows = 2,
  gap = 8,
): number {
  if (tagWidths.length === 0 || containerWidth <= 0) return 0;

  const rowsNeeded = (widths: number[]) => {
    let rows = 1;
    let used = 0;
    for (const width of widths) {
      if (used > 0 && used + gap + width > containerWidth) {
        rows += 1;
        used = width;
      } else {
        used += (used > 0 ? gap : 0) + width;
      }
    }
    return rows;
  };

  if (rowsNeeded(tagWidths) <= maxRows) return tagWidths.length;

  for (let visible = tagWidths.length - 1; visible >= 0; visible -= 1) {
    const hidden = tagWidths.length - visible;
    const moreWidth = moreButtonWidths[hidden] ?? 0;
    if (rowsNeeded([...tagWidths.slice(0, visible), moreWidth]) <= maxRows) return visible;
  }

  return 0;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "המטפל/ת";
}

function TwoRowTags({ items, interactive }: { items: TagItem[]; interactive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [expanded, setExpanded] = useState(false);
  const itemSignature = items.map((item) => item.key).join("|");

  useEffect(() => {
    setExpanded(false);
  }, [itemSignature]);

  useEffect(() => {
    const container = containerRef.current;
    const measurement = measureRef.current;
    if (!container || !measurement) return;

    const measure = () => {
      const tagWidths = Array.from(measurement.querySelectorAll<HTMLElement>("[data-measure-tag]")).map(
        (node) => node.getBoundingClientRect().width,
      );
      const moreButtonWidths: Record<number, number> = {};
      measurement.querySelectorAll<HTMLElement>("[data-measure-more]").forEach((node) => {
        moreButtonWidths[Number(node.dataset.measureMore)] = node.getBoundingClientRect().width;
      });
      setVisibleCount(visibleTagCountForRows(tagWidths, container.getBoundingClientRect().width, moreButtonWidths));
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    void document.fonts?.ready.then(measure);
    return () => observer?.disconnect();
  }, [itemSignature, items.length]);

  const shownItems = expanded ? items : items.slice(0, visibleCount);
  const hiddenCount = items.length - visibleCount;

  return (
    <div ref={containerRef} className="relative min-w-0 max-w-full overflow-hidden">
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        {shownItems.map((item) =>
          item.problemSlug && interactive ? (
            <Link
              key={item.key}
              to="/problems/$slug"
              params={{ slug: item.problemSlug }}
              className={`${TAG_CLASS} transition-colors hover:border-brand/50 hover:bg-brand-soft`}
            >
              {item.label}
            </Link>
          ) : (
            <span key={item.key} className={TAG_CLASS}>
              {item.label}
            </span>
          ),
        )}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${TAG_CLASS} border-brand/30 bg-brand-soft font-medium text-primary transition-colors hover:bg-brand-soft/70`}
          >
            +{hiddenCount} נוספים
          </button>
        )}
        {expanded && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center px-2 py-1.5 text-sm font-medium text-primary hover:underline"
          >
            פחות
          </button>
        )}
      </div>

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 flex max-w-full flex-wrap gap-2 overflow-hidden"
      >
        {items.map((item) => (
          <span key={`measure-${item.key}`} data-measure-tag className={TAG_CLASS}>
            {item.label}
          </span>
        ))}
        <div className="absolute left-0 top-0 flex flex-col items-start gap-1">
          {items.map((_, index) => {
            const hidden = index + 1;
            return (
              <span
                key={`measure-more-${hidden}`}
                data-measure-more={hidden}
                className={`${TAG_CLASS} border-brand/30 bg-brand-soft font-medium text-primary`}
              >
                +{hidden} נוספים
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TagGroup({ title, items, interactive }: { title: string; items: TagItem[]; interactive: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0 max-w-full">
      <h3 className="mb-2.5 break-words text-sm font-semibold text-foreground/75">{title}</h3>
      <TwoRowTags items={items} interactive={interactive} />
    </div>
  );
}

export function ClinicLocationsCard({ locations }: { locations: TherapistProfileViewData["locations"] }) {
  if (locations.length === 0) return null;

  return (
    <div className="box-border h-full w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">טיפול בקליניקה</p>
          <div className="mt-2 divide-y divide-border/70">
            {locations.map((location, index) => {
              const accessibilityLabel = clinicAccessibilityLabel(location.accessibility_status);
              const featureLabels = accessibilityFeatureLabels(location.accessibility_features);
              const accessibilityNote = location.accessibility_note?.trim();

              return (
                <div
                  key={`clinic-${location.city ?? "location"}-${index}`}
                  className="min-w-0 max-w-full py-2 first:pt-0 last:pb-0"
                >
                  {location.city && <p className="break-words text-sm text-muted-foreground">{location.city}</p>}
                  {(accessibilityLabel || featureLabels.length > 0 || accessibilityNote) && (
                    <div className="mt-1.5 space-y-1.5">
                      {accessibilityLabel && (
                        <p className="text-xs font-medium text-foreground/75">{accessibilityLabel}</p>
                      )}
                      {featureLabels.length > 0 && (
                        <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
                          {featureLabels.map((feature) => (
                            <span
                              key={feature}
                              className="max-w-full break-words rounded-full border border-brand/20 bg-brand-soft px-2 py-0.5 text-xs text-foreground/75"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                      {accessibilityNote && (
                        <p className="break-words text-xs leading-5 text-muted-foreground">
                          מידע נוסף: {accessibilityNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileImage({
  imageUrl,
  name,
  compact = false,
}: {
  imageUrl: string | null;
  name: string;
  compact?: boolean;
}) {
  const size = compact ? "h-14 w-14 rounded-2xl text-lg" : "h-28 w-28 rounded-3xl text-3xl sm:h-36 sm:w-36";
  if (imageUrl) {
    return <img src={imageUrl} alt={name || "תמונת פרופיל"} className={`${size} shrink-0 object-cover shadow-card`} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`${size} flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground shadow-card`}
    >
      {initials(name) || "ט"}
    </div>
  );
}

function CollapsibleProfessionalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 font-semibold text-foreground marker:content-none sm:px-5">
        <span className="min-w-0 break-words">{title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="min-w-0 max-w-full overflow-hidden border-t border-border px-4 py-4 text-sm leading-7 text-foreground/80 sm:px-5">
        {children}
      </div>
    </details>
  );
}

export function TherapistProfileView({
  therapist: t,
  interactive = true,
}: {
  therapist: TherapistProfileViewData;
  interactive?: boolean;
}) {
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const clinicLocations = t.locations.filter((location) => location.location_type === "clinic");
  const onlineAvailable = t.locations.some((location) => location.location_type === "online");
  const homeVisitLocations = t.locations.filter((location) => location.location_type === "home_visit");
  const homeVisitRegions = [
    ...new Set(homeVisitLocations.map((location) => location.region).filter(Boolean)),
  ] as string[];
  const displayLocation =
    clinicLocations.find((location) => location.is_primary)?.city ??
    clinicLocations.find((location) => location.city)?.city ??
    t.city;
  const treatmentProblems = t.problems;
  const hasTreatmentDetails =
    t.professions.length > 0 ||
    treatmentProblems.length > 0 ||
    t.modalities.length > 0 ||
    t.populations.length > 0 ||
    t.therapy_formats.length > 0;
  const hasProfessionalDetails =
    !!t.education_training || !!t.professional_experience || t.professional_memberships.length > 0;
  const longAbout = (t.full_description?.length ?? 0) > 420;
  const freeIntroLabels = freeIntroTypeLabels(t.free_intro_types);

  const heroServiceTags = useMemo(() => {
    const tags: { key: string; label: string; icon: React.ReactNode }[] = [];
    if (clinicLocations.length > 0) tags.push({ key: "clinic", label: "טיפול בקליניקה", icon: <Building2 /> });
    if (onlineAvailable) tags.push({ key: "online", label: "טיפול אונליין", icon: <Video /> });
    if (homeVisitLocations.length > 0) tags.push({ key: "home", label: "ביקורי בית", icon: <Home /> });
    return tags;
  }, [clinicLocations.length, homeVisitLocations.length, onlineAvailable]);

  return (
    <article className="box-border w-full min-w-0 max-w-full space-y-6 overflow-x-clip">
      <header className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated shadow-card">
        <div className="bg-gradient-to-br from-brand-soft via-surface-elevated to-surface px-5 py-7 sm:px-9 sm:py-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfileImage imageUrl={t.image_url} name={t.full_name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="min-w-0 break-words text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                  {t.full_name || "שם המטפל/ת"}
                </h1>
                {t.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-primary">
                    <BadgeCheck className="h-4 w-4" /> מאומת
                  </span>
                )}
              </div>
              <p className="mt-1.5 break-words text-lg font-medium text-foreground/80">
                {t.professional_title || "כותרת מקצועית"}
              </p>
              {t.short_intro && (
                <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted-foreground sm:text-base">
                  {t.short_intro}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/75">
                {t.years_experience !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-4 w-4 text-primary" />
                    <span>
                      <span className="ltr-num">{t.years_experience}</span> שנות ניסיון
                    </span>
                  </span>
                )}
                {t.languages.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Languages className="h-4 w-4 text-primary" />
                    {t.languages.map((language) => language.name).join(" · ")}
                  </span>
                )}
              </div>

              {clinicLocations.length > 0 && (
                <div className="mt-3 flex min-w-0 max-w-full items-start gap-1.5 text-sm text-foreground/75">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                    {clinicLocations.map((location, index) => (
                      <span key={`hero-location-${location.city ?? index}`} className="break-words">
                        {location.city || "מיקום קליניקה"}
                        {index < clinicLocations.length - 1 ? " | " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(heroServiceTags.length > 0 || t.lgbtq_affirming) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {heroServiceTags.map((tag) => (
                    <span
                      key={tag.key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-elevated/80 px-3 py-1.5 text-xs font-medium text-foreground/80"
                    >
                      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-primary">{tag.icon}</span>
                      {tag.label}
                    </span>
                  ))}
                  {t.lgbtq_affirming && (
                    <span className="rounded-full border border-white/70 bg-[linear-gradient(90deg,rgba(239,68,68,.18),rgba(245,158,11,.18),rgba(34,197,94,.18),rgba(59,130,246,.18),rgba(168,85,247,.18))] px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
                      טיפול מותאם לקהילה הגאה
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="box-border block w-full min-w-0 max-w-full lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6">
        <main className="box-border min-w-0 max-w-full space-y-5">
          {t.full_description && (
            <section className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold text-foreground">קצת עלי</h2>
              <p
                className={`mt-3 break-words whitespace-pre-line text-base leading-8 text-foreground/80 ${
                  longAbout && !aboutExpanded ? "line-clamp-5" : ""
                }`}
              >
                {t.full_description}
              </p>
              {longAbout && (
                <button
                  type="button"
                  onClick={() => setAboutExpanded((value) => !value)}
                  className="mt-3 text-sm font-semibold text-primary hover:underline"
                >
                  {aboutExpanded ? "הצג פחות" : "קראו עוד"}
                </button>
              )}
            </section>
          )}

          {hasTreatmentDetails && (
            <section className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold text-foreground">טיפול והתאמה</h2>
              <div className="mt-5 min-w-0 max-w-full space-y-5">
                <TagGroup
                  title="מקצועות"
                  interactive={interactive}
                  items={t.professions.map((item) => ({ key: item.slug, label: item.name }))}
                />
                <TagGroup
                  title="תחומי טיפול"
                  interactive={interactive}
                  items={treatmentProblems.map((item) => ({
                    key: item.id,
                    label: item.name,
                    problemSlug: item.slug,
                  }))}
                />
                <TagGroup
                  title="גישות ושיטות"
                  interactive={interactive}
                  items={t.modalities.map((item) => ({ key: item.slug, label: item.name }))}
                />
                <TagGroup
                  title="אוכלוסיות"
                  interactive={interactive}
                  items={t.populations.map((item) => ({ key: item.slug, label: item.name }))}
                />
                <TagGroup
                  title="מסגרת הטיפול"
                  interactive={interactive}
                  items={t.therapy_formats.map((item) => ({ key: item.slug, label: item.name }))}
                />
              </div>
            </section>
          )}

          {(t.locations.length > 0 || t.service_arrangements.length > 0) && (
            <section className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold text-foreground">מיקום ואופן הטיפול</h2>
              {t.locations.length > 0 && (
                <div
                  className={`mt-4 grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] items-stretch gap-3 ${
                    clinicLocations.length > 0 && (onlineAvailable || homeVisitLocations.length > 0)
                      ? "sm:grid-cols-2"
                      : ""
                  }`}
                >
                  {clinicLocations.length > 0 && <ClinicLocationsCard locations={clinicLocations} />}
                  {(onlineAvailable || homeVisitLocations.length > 0) && (
                    <div
                      className={`grid min-w-0 max-w-full gap-3 ${
                        onlineAvailable && homeVisitLocations.length > 0 ? "grid-rows-2" : "grid-rows-1"
                      }`}
                    >
                      {onlineAvailable && (
                        <div className="h-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/70 p-4">
                          <div className="flex items-start gap-3">
                            <Video className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                            <div>
                              <p className="font-semibold text-foreground">טיפול אונליין</p>
                              <p className="mt-0.5 text-sm text-muted-foreground">מכל מקום בארץ</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {homeVisitLocations.length > 0 && (
                        <div className="h-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/70 p-4">
                          <div className="flex items-start gap-3">
                            <Home className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                            <div>
                              <p className="font-semibold text-foreground">ביקורי בית</p>
                              {homeVisitRegions.length > 0 && (
                                <p className="mt-0.5 text-sm text-muted-foreground">{homeVisitRegions.join(" · ")}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {t.service_arrangements.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground/75">הסדרים עם גופים</h3>
                  <div className="mt-2.5 flex min-w-0 max-w-full flex-wrap gap-2">
                    {t.service_arrangements.map((item, index) => (
                      <span
                        key={`${item.organization_name}-${index}`}
                        className="inline-flex max-w-full items-center break-words rounded-full border border-brand/20 bg-surface-elevated/80 px-3 py-1.5 text-xs font-medium text-foreground/80"
                        title={item.note ?? undefined}
                      >
                        {item.organization_name}
                        {item.note ? ` · ${item.note}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {hasProfessionalDetails && (
            <section className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-soft sm:p-7">
              <h2 className="text-xl font-bold text-foreground">מידע מקצועי נוסף</h2>
              <div className="mt-4 space-y-3">
                {t.education_training && (
                  <CollapsibleProfessionalSection title="השכלה והכשרה">
                    <p className="break-words whitespace-pre-line">{t.education_training}</p>
                  </CollapsibleProfessionalSection>
                )}
                {t.professional_experience && (
                  <CollapsibleProfessionalSection title="ניסיון מקצועי">
                    <p className="break-words whitespace-pre-line">{t.professional_experience}</p>
                  </CollapsibleProfessionalSection>
                )}
                {t.professional_memberships.length > 0 && (
                  <CollapsibleProfessionalSection title="חברות באיגודים מקצועיים">
                    <ul className="space-y-2">
                      {t.professional_memberships.map((item, index) => (
                        <li key={`${item.organization_name}-${index}`} className="break-words">
                          {item.organization_name}
                          {item.member_since ? `, משנת ${item.member_since}` : ""}
                        </li>
                      ))}
                    </ul>
                  </CollapsibleProfessionalSection>
                )}
              </div>
            </section>
          )}
        </main>

        <aside className="box-border mt-6 min-w-0 max-w-full lg:sticky lg:top-24 lg:mt-0 lg:self-start">
          <div className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-card">
            <div className="flex min-w-0 max-w-full items-center gap-3 border-b border-border pb-4">
              <ProfileImage imageUrl={t.image_url} name={t.full_name} compact />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate font-bold text-foreground">{t.full_name || "שם המטפל/ת"}</p>
                <p className="line-clamp-2 whitespace-normal break-words text-sm leading-snug text-muted-foreground">
                  {t.professional_title || "כותרת מקצועית"}
                </p>
              </div>
            </div>

            {(clinicLocations.length > 0 || onlineAvailable || homeVisitLocations.length > 0) && (
              <div className="mt-4 space-y-2 text-xs leading-5 text-muted-foreground">
                {clinicLocations.map((location, index) => (
                  <div key={`contact-location-${location.city ?? index}`} className="flex min-w-0 items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0 break-words">
                      {location.city || "מיקום קליניקה"}
                      {clinicAccessibilityLabel(location.accessibility_status)
                        ? ` · ${clinicAccessibilityLabel(location.accessibility_status)}`
                        : ""}
                    </span>
                  </div>
                ))}
                {onlineAvailable && (
                  <p className="flex items-start gap-1.5">
                    <Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> טיפול אונליין
                  </p>
                )}
                {homeVisitLocations.length > 0 && (
                  <p className="flex items-start gap-1.5">
                    <Home className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>ביקורי בית{homeVisitRegions.length > 0 ? ` · ${homeVisitRegions.join(" · ")}` : ""}</span>
                  </p>
                )}
              </div>
            )}

            {t.offers_free_intro && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-900">
                <p className="flex items-start gap-2 font-semibold">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    פגישת או שיחת היכרות ללא תשלום
                    {t.free_intro_duration_minutes ? ` · ${t.free_intro_duration_minutes} דקות` : ""}
                  </span>
                </p>
                {freeIntroLabels.length > 0 && (
                  <p className="mt-1.5 break-words pr-6 text-xs leading-5 text-emerald-800">
                    {freeIntroLabels.join(" · ")}
                  </p>
                )}
              </div>
            )}

            <h2 className="mt-5 text-lg font-bold text-foreground">רוצים לתאם טיפול עם {firstName(t.full_name)}?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              שלחו ל{firstName(t.full_name)} הודעה כדי לבדוק התאמה וזמינות.
            </p>
            <div className="mt-4">
              {interactive ? (
                <CtaCallButton therapistId={t.id} therapistName={t.full_name} pageSource="therapist_profile" />
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-base font-semibold text-brand-foreground opacity-60"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>שליחת פנייה</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="box-border min-w-0 max-w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 text-center text-xs leading-5 text-muted-foreground sm:text-sm">
        כל התוכן המופיע בעמוד זה הוא באחריות המטפל/ת בלבד.
      </footer>
    </article>
  );
}

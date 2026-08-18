import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ClinicLocationsCard,
  TherapistProfileView,
  type TherapistProfileViewData,
  visibleTagCountForRows,
} from "./therapist-profile-view";

const profileSource = readFileSync(new URL("./therapist-profile-view.tsx", import.meta.url), "utf8");

describe("visibleTagCountForRows", () => {
  it("shows every tag when they fit within two rows", () => {
    expect(visibleTagCountForRows([80, 80, 80, 80], 176, {}, 2, 8)).toBe(4);
  });

  it("reserves space for the exact more button", () => {
    const moreWidths = { 1: 72, 2: 72, 3: 72, 4: 72 };
    expect(visibleTagCountForRows([80, 80, 80, 80, 80], 176, moreWidths, 2, 8)).toBe(3);
  });

  it("uses rendered widths rather than a fixed number of tags", () => {
    const moreWidths = { 1: 70, 2: 70, 3: 70, 4: 70 };
    expect(visibleTagCountForRows([45, 45, 45, 45, 45, 45, 45], 160, moreWidths, 2, 8)).toBe(4);
    expect(visibleTagCountForRows([120, 120, 120], 160, moreWidths, 2, 8)).toBe(1);
  });

  it("handles empty and zero-width containers safely", () => {
    expect(visibleTagCountForRows([], 200, {})).toBe(0);
    expect(visibleTagCountForRows([80], 0, { 1: 60 })).toBe(0);
  });
});

describe("ClinicLocationsCard", () => {
  it("renders all clinics in one card with accessibility beneath each location", () => {
    const html = renderToStaticMarkup(
      createElement(ClinicLocationsCard, {
        locations: [
          {
            location_type: "clinic",
            city: "רחובות",
            region: "מרכז והשפלה",
            is_primary: true,
            accessibility_status: "accessible",
            accessibility_features: ["step_free_entrance", "accessible_parking"],
            accessibility_note: "כניסה מהחניה",
          },
          {
            location_type: "clinic",
            city: "ראשון לציון",
            region: "מרכז והשפלה",
            is_primary: false,
            accessibility_status: "partially_accessible",
            accessibility_features: [],
            accessibility_note: null,
          },
          {
            location_type: "clinic",
            city: "חולון",
            region: "תל אביב וגוש דן",
            is_primary: false,
            accessibility_status: "unknown",
            accessibility_features: [],
            accessibility_note: null,
          },
          {
            location_type: "clinic",
            city: "בת ים",
            region: "תל אביב וגוש דן",
            is_primary: false,
            accessibility_status: "not_accessible",
            accessibility_features: [],
            accessibility_note: "יש מדרגות בכניסה",
          },
        ],
      }),
    );

    expect(html.match(/טיפול בקליניקה/g)).toHaveLength(1);
    expect(html).toContain("רחובות");
    expect(html).toContain("קליניקה נגישה");
    expect(html).toContain("כניסה ללא מדרגות");
    expect(html).toContain("חניית נכים");
    expect(html).toContain("מידע נוסף: כניסה מהחניה");
    expect(html).toContain("ראשון לציון");
    expect(html).toContain("קליניקה נגישה חלקית");
    expect(html).toContain("חולון");
    expect(html).toContain("בת ים");
    expect(html).toContain("הקליניקה אינה נגישה");
    expect(html).toContain("מידע נוסף: יש מדרגות בכניסה");
    expect(html).not.toContain("step_free_entrance");
    expect(html).not.toContain("<details");
  });

  it("renders nothing when no clinic locations are provided", () => {
    expect(renderToStaticMarkup(createElement(ClinicLocationsCard, { locations: [] }))).toBe("");
  });
});

describe("free introductory session details", () => {
  it("renders every selected introductory-session type with the duration", () => {
    const therapist: TherapistProfileViewData = {
      id: "t-1",
      full_name: "רות לוי",
      professional_title: "פסיכולוגית קלינית",
      short_intro: null,
      full_description: null,
      education_training: null,
      professional_experience: null,
      years_experience: 10,
      city: null,
      image_url: null,
      verified: false,
      lgbtq_affirming: false,
      offers_free_intro: true,
      free_intro_types: ["phone", "video", "in_person"],
      free_intro_duration_minutes: 20,
      professions: [],
      modalities: [],
      therapy_formats: [],
      locations: [],
      professional_memberships: [],
      service_arrangements: [],
      problems: [],
      populations: [],
      languages: [],
    };

    const html = renderToStaticMarkup(createElement(TherapistProfileView, { therapist, interactive: false }));

    expect(html).not.toContain("מאפייני הטיפול");
    expect(html).toContain("פגישת או שיחת היכרות ללא תשלום · 20 דקות");
    expect(html).toContain("טלפון · וידאו · פגישה בקליניקה");
  });
});

describe("public contact actions", () => {
  it("renders the preferred method first and keeps additional methods secondary", () => {
    const therapist: TherapistProfileViewData = {
      id: "t-contact",
      full_name: "רות לוי",
      professional_title: "פסיכולוגית קלינית",
      short_intro: null,
      full_description: null,
      education_training: null,
      professional_experience: null,
      years_experience: 10,
      city: null,
      image_url: null,
      verified: false,
      lgbtq_affirming: false,
      offers_free_intro: false,
      free_intro_types: [],
      free_intro_duration_minutes: null,
      contact_methods: ["email", "phone", "whatsapp"],
      preferred_contact_method: "whatsapp",
      professions: [],
      modalities: [],
      therapy_formats: [],
      locations: [],
      professional_memberships: [],
      service_arrangements: [],
      problems: [],
      populations: [],
      languages: [],
    };

    const html = renderToStaticMarkup(createElement(TherapistProfileView, { therapist, interactive: false }));

    const whatsapp = html.indexOf("שליחת הודעה ב־WhatsApp");
    const phone = html.indexOf("שיחה טלפונית");
    const email = html.indexOf("שליחת פנייה באימייל");

    expect(whatsapp).toBeGreaterThan(-1);
    expect(phone).toBeGreaterThan(whatsapp);
    expect(email).toBeGreaterThan(whatsapp);
    expect(html).not.toContain(">SMS<");
  });
});

describe("result-card language presentation", () => {
  const cardSource = readFileSync(new URL("./therapist-card.tsx", import.meta.url), "utf8");

  it("renders languages as plain text instead of overflow tags", () => {
    expect(cardSource).toContain('{t.language_names.join(", ")}');
    expect(cardSource).toContain("שפות:");
    expect(cardSource).not.toContain("<CompactTagRow labels={t.language_names} />");
  });
});

describe("mobile profile width guards", () => {
  it("uses normal block sizing on mobile and enables the two-column grid only on desktop", () => {
    expect(profileSource).toContain(
      "box-border block w-full min-w-0 max-w-full lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-6",
    );
    expect(profileSource).not.toContain('className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]"');
  });

  it("constrains the main content and contact card to the available mobile width", () => {
    expect(profileSource).toContain(
      '<article className="box-border w-full min-w-0 max-w-full space-y-6 overflow-x-clip">',
    );
    expect(profileSource).toContain('main className="box-border min-w-0 max-w-full space-y-5"');
    expect(profileSource).toContain(
      'aside className="box-border mt-6 min-w-0 max-w-full lg:sticky lg:top-24 lg:mt-0 lg:self-start"',
    );
    expect(profileSource).toContain(
      'className="box-border min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-surface-elevated p-5 shadow-card"',
    );
  });

  it("constrains every padded profile section instead of relying on its content width", () => {
    const sectionOpenings = profileSource.match(/<section className="[^"]+"/g) ?? [];

    expect(sectionOpenings).toHaveLength(4);
    for (const section of sectionOpenings) {
      expect(section).toContain('className="box-border min-w-0 max-w-full overflow-hidden');
    }
  });

  it("constrains tags, location grids and long dynamic text", () => {
    expect(profileSource).toContain("inline-flex max-w-full shrink-0 items-center truncate whitespace-nowrap");
    expect(profileSource).toContain('className="relative min-w-0 max-w-full overflow-hidden"');
    expect(profileSource).toContain("grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)]");
    expect(profileSource).toContain("mt-3 break-words whitespace-pre-line text-base");
    expect(profileSource).toContain('className="max-w-full break-words rounded-full');
    expect(profileSource).toContain('className="group min-w-0 max-w-full overflow-hidden');
  });

  it("allows a long professional title to wrap to two lines without widening the compact contact header", () => {
    expect(profileSource).toContain(
      'className="flex min-w-0 max-w-full items-center gap-3 border-b border-border pb-4"',
    );
    expect(profileSource).toContain('className="min-w-0 flex-1 overflow-hidden"');
    expect(profileSource).toContain(
      'className="line-clamp-2 whitespace-normal break-words text-sm leading-snug text-muted-foreground"',
    );
    expect(profileSource).not.toContain('className="truncate text-sm text-muted-foreground"');
  });
});

describe("professional profile sections", () => {
  it("renders education and professional experience as separate collapsible sections", () => {
    expect(profileSource).toContain('title="השכלה והכשרה"');
    expect(profileSource).toContain("t.education_training");
    expect(profileSource).toContain('title="ניסיון מקצועי"');
    expect(profileSource).toContain("t.professional_experience");
    expect(profileSource).not.toContain("t.background");
  });
});

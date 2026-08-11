/**
 * Focused guards for the therapist profile preview.
 *
 * The preview reuses the real public presentation (`TherapistProfileView`)
 * with the editor's current in-memory form values, and must never save,
 * publish or submit a lead.
 */
import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPreviewViewData, type PreviewFormState } from "./profile-preview-adapter";
import type { EditorOptions } from "./therapist-profile.functions";

const editorSource = readFileSync(
  join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"),
  "utf8",
);

const options = {
  professions: [{ id: "p1", name_he: "פסיכולוגית", slug: "psychologist" }],
  modalities: [{ id: "m1", name_he: "CBT", slug: "cbt" }],
  languages: [
    { id: "l1", name: "עברית", code: "he" },
    { id: "l2", name: "אנגלית", code: "en" },
  ],
  populations: [{ id: "g1", name: "מתבגרים", slug: "teens" }],
  localities: [],
  locality_options_error: false,
  therapy_formats: [{ id: "f1", name_he: "טיפול זוגי", slug: "couples" }],
} as unknown as EditorOptions;

function form(overrides: Partial<PreviewFormState> = {}): PreviewFormState {
  return {
    full_name: "רות לוי",
    professional_title: "פסיכולוגית קלינית",
    full_description: "טקסט לא שמור על אודותיי",
    short_intro: "משפט פתיחה",
    background: "רקע מקצועי",
    years_experience: "12",
    image_url: "https://example.com/a.jpg",
    profession_ids: ["p1"],
    modality_ids: ["m1"],
    language_ids: ["l2"],
    population_ids: ["g1"],
    locations: [
      {
        city: "חיפה",
        region: "north",
        accessibility_status: "accessible",
        accessibility_features: ["accessible_elevator"],
        accessibility_note: "",
      },
    ],
    online_available: true,
    home_visit_available: false,
    home_visit_regions: [],
    therapy_format_ids: ["f1"],
    lgbtq_affirming: true,
    offers_free_intro: true,
    free_intro_types: ["phone"],
    free_intro_duration_minutes: "20",
    professional_memberships: [{ organization_name: "הסתדרות הפסיכולוגים", member_since: "2015" }],
    service_arrangements: [{ organization_name: "מכבי", note: "הסדר" }],
    ...overrides,
  };
}

describe("buildPreviewViewData", () => {
  it("maps the current unsaved form values into the public view model", () => {
    const view = buildPreviewViewData(form(), options, { id: "t1", verified: true });
    expect(view.full_name).toBe("רות לוי");
    expect(view.professional_title).toBe("פסיכולוגית קלינית");
    expect(view.full_description).toBe("טקסט לא שמור על אודותיי");
    expect(view.years_experience).toBe(12);
    expect(view.city).toBe("חיפה");
    expect(view.professions.map((p) => p.name)).toEqual(["פסיכולוגית"]);
    expect(view.modalities.map((m) => m.name)).toEqual(["CBT"]);
    expect(view.populations.map((p) => p.name)).toEqual(["מתבגרים"]);
    expect(view.languages.map((l) => l.code)).toEqual(["en"]);
    expect(view.therapy_formats.map((f) => f.slug)).toEqual(["couples"]);
    expect(view.professional_memberships).toEqual([
      { organization_name: "הסתדרות הפסיכולוגים", member_since: 2015 },
    ]);
    expect(view.service_arrangements).toEqual([{ organization_name: "מכבי", note: "הסדר" }]);
    expect(view.lgbtq_affirming).toBe(true);
    expect(view.offers_free_intro).toBe(true);
    expect(view.free_intro_duration_minutes).toBe(20);
    expect(view.locations.map((l) => l.location_type)).toEqual(["clinic", "online"]);
    expect(view.verified).toBe(true);
  });

  it("never exposes ranking data as a declared public field", () => {
    expect(buildPreviewViewData(form(), options, null).problems).toEqual([]);
  });

  it("opens gracefully for an empty draft without publish validation", () => {
    const view = buildPreviewViewData(
      form({
        full_name: "",
        professional_title: "",
        full_description: "",
        short_intro: "",
        background: "",
        years_experience: "",
        image_url: "",
        profession_ids: [],
        modality_ids: [],
        language_ids: [],
        population_ids: [],
        locations: [],
        online_available: false,
        therapy_format_ids: [],
        offers_free_intro: false,
        free_intro_types: [],
        free_intro_duration_minutes: "",
        professional_memberships: [],
        service_arrangements: [],
      }),
      undefined,
      null,
    );
    expect(view.id).toBe("preview");
    expect(view.full_name).toBe("");
    expect(view.professional_title).toBeNull();
    expect(view.years_experience).toBeNull();
    expect(view.locations).toEqual([]);
    expect(view.languages).toEqual([]);
  });
});

describe("preview rendering reuses the public profile presentation", () => {
  it("renders the real public view with contact actions disabled and no lead form", async () => {
    const leadCalls: string[] = [];
    mock.module("@/lib/lead.functions", () => ({
      createLead: () => {
        leadCalls.push("createLead");
        throw new Error("preview must never submit a lead");
      },
    }));
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { TherapistProfileView } = await import("@/components/therapist-profile-view");

    const view = buildPreviewViewData(form(), options, { id: "t1", verified: false });
    const html = renderToStaticMarkup(
      <TherapistProfileView therapist={view} interactive={false} />,
    );

    expect(html).toContain("רות לוי");
    expect(html).toContain("טקסט לא שמור על אודותיי");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
    // The real lead dialog / phone reveal never mounts in preview mode.
    expect(html).not.toContain('role="dialog"');
    expect(leadCalls).toEqual([]);
  });
});

describe("editor preview wiring", () => {
  it("keeps exactly one preview button and one preview dialog", () => {
    expect(editorSource.split("תצוגה מקדימה").length - 1).toBe(2); // button label + dialog title
    expect(editorSource).toContain("<Dialog open={previewOpen} onOpenChange={setPreviewOpen}>");
    expect(editorSource.match(/previewOpen/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("builds the preview from live form state, not a refetch", () => {
    expect(editorSource).toContain("buildPreviewViewData(form, options.data, profile.data)");
    expect(editorSource).toContain(
      "<TherapistProfileView therapist={previewData} interactive={false} />",
    );
  });

  it("opening the preview only toggles local state — no save, publish or refetch call", () => {
    const openHandler = editorSource.match(/onPreview=\{\(\)\s*=>\s*([^}]+)\}/);
    expect(openHandler?.[1]?.trim()).toBe("setPreviewOpen(true)");
    expect(editorSource).not.toContain("onPreview={() => mutation.mutate");
  });

  it("keeps the preview modal scrollable, viewport-bound and RTL above the sticky header", () => {
    expect(editorSource).toContain('dir="rtl"');
    expect(editorSource).toContain("h-[calc(100dvh-1rem)]");
    expect(editorSource).toContain("overflow-y-auto overscroll-contain");
  });
});

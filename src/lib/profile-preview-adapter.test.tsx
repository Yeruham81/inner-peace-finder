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

const editorSource = readFileSync(join(import.meta.dir, "..", "routes", "_authenticated", "new-profile.tsx"), "utf8");
const overviewSource = readFileSync(
  join(import.meta.dir, "..", "routes", "_authenticated", "account.index.tsx"),
  "utf8",
);
const onboardingCardSource = readFileSync(
  join(import.meta.dir, "..", "components", "account", "profile-onboarding-card.tsx"),
  "utf8",
);
const settingsSource = readFileSync(
  join(import.meta.dir, "..", "routes", "_authenticated", "account.settings.tsx"),
  "utf8",
);
const contactPreferencesSource = readFileSync(
  join(import.meta.dir, "..", "components", "account", "contact-preferences-panel.tsx"),
  "utf8",
);
const deleteProfilePanelSource = readFileSync(
  join(import.meta.dir, "..", "components", "account", "delete-profile-panel.tsx"),
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
    education_training: "תואר שני בפסיכולוגיה קלינית והכשרת CBT",
    professional_experience: "12 שנות ניסיון במרפאה ציבורית ובקליניקה פרטית",
    years_experience: "12",
    image_url: "https://example.com/a.jpg",
    gender: "female",
    contact_methods: ["whatsapp", "email", "phone"],
    preferred_contact_method: "whatsapp",
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
    professional_memberships: [
      {
        organization_name: "הסתדרות הפסיכולוגים",
        membership_start_date: "2015-06-15",
        member_since: "",
      },
    ],
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
    expect(view.education_training).toBe("תואר שני בפסיכולוגיה קלינית והכשרת CBT");
    expect(view.professional_experience).toBe("12 שנות ניסיון במרפאה ציבורית ובקליניקה פרטית");
    expect(view.years_experience).toBe(12);
    expect(view.city).toBe("חיפה");
    expect(view.professions.map((p) => p.name)).toEqual(["פסיכולוגית"]);
    expect(view.modalities.map((m) => m.name)).toEqual(["CBT"]);
    expect(view.populations.map((p) => p.name)).toEqual(["מתבגרים"]);
    expect(view.languages.map((l) => l.code)).toEqual(["en"]);
    expect(view.therapy_formats.map((f) => f.slug)).toEqual(["couples"]);
    expect(view.professional_memberships).toEqual([{ organization_name: "הסתדרות הפסיכולוגים", member_since: 2015 }]);
    expect(view.service_arrangements).toEqual([{ organization_name: "מכבי", note: "הסדר" }]);
    expect(view.lgbtq_affirming).toBe(true);
    expect(view.offers_free_intro).toBe(true);
    expect(view.free_intro_duration_minutes).toBe(20);
    expect(view.contact_methods).toEqual(["whatsapp", "email", "phone"]);
    expect(view.preferred_contact_method).toBe("whatsapp");
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
        education_training: "",
        professional_experience: "",
        years_experience: "",
        image_url: "",
        contact_methods: [],
        preferred_contact_method: "",
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
    expect(view.education_training).toBeNull();
    expect(view.professional_experience).toBeNull();
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
    const html = renderToStaticMarkup(<TherapistProfileView therapist={view} interactive={false} />);

    expect(html).toContain("רות לוי");
    expect(html).toContain("טקסט לא שמור על אודותיי");
    expect(html).toContain("השכלה והכשרה");
    expect(html).toContain("תואר שני בפסיכולוגיה קלינית והכשרת CBT");
    expect(html).toContain("ניסיון מקצועי");
    expect(html).toContain("12 שנות ניסיון במרפאה ציבורית ובקליניקה פרטית");
    expect(html).toContain("שליחת הודעה ב־WhatsApp");
    expect(html).toContain("שיחה טלפונית");
    expect(html).toContain("שליחת פנייה באימייל");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-disabled="true"');
    // The real lead dialog / phone reveal never mounts in preview mode.
    expect(html).not.toContain('role="dialog"');
    expect(leadCalls).toEqual([]);
  });
});

describe("professional details editor placement", () => {
  it("collects education and professional experience in separate free-text fields", () => {
    const education = editorSource.indexOf('<Section title="השכלה והכשרה">');
    const experience = editorSource.indexOf('<Section title="ניסיון מקצועי">');
    const credential = editorSource.indexOf("<TherapistCredentialPanel", education);
    const memberships = editorSource.indexOf('<Section title="איגודים מקצועיים">');

    expect(education).toBeGreaterThan(-1);
    expect(experience).toBeGreaterThan(education);
    expect(credential).toBeGreaterThan(education);
    expect(credential).toBeLessThan(experience);
    expect(memberships).toBeGreaterThan(experience);
    expect(editorSource).toContain("form.education_training");
    expect(editorSource).toContain("form.professional_experience");
    expect(editorSource).not.toContain("form.background");
  });

  it("collects a membership start date alongside each professional organization", () => {
    expect(editorSource).toContain("function MembershipListEditor");
    expect(editorSource).toContain("תאריך תחילת החברות");
    expect(editorSource).toContain("membership_start_date");
  });

  it("places service arrangements at the bottom of treatment characteristics", () => {
    const treatmentCharacteristics = editorSource.indexOf('<Section title="מאפייני הטיפול">');
    const arrangements = editorSource.indexOf('title="הסדרים עם גופים"', treatmentCharacteristics);
    const treatmentLocation = editorSource.indexOf('<Section title="מיקום הטיפול *">');

    expect(treatmentCharacteristics).toBeGreaterThan(-1);
    expect(arrangements).toBeGreaterThan(treatmentCharacteristics);
    expect(arrangements).toBeLessThan(treatmentLocation);
    expect(editorSource).not.toContain('<Section title="איגודים מקצועיים והסדרים">');
  });
});

describe("treatment framework selection layout", () => {
  it("uses two columns on mobile, keeps three on desktop, and never truncates labels", () => {
    const frameworkStart = editorSource.indexOf('<Section title="מסגרת הטיפול">');
    const frameworkEnd = editorSource.indexOf('<Section title="מאפייני הטיפול">', frameworkStart);
    const frameworkSource = editorSource.slice(frameworkStart, frameworkEnd);

    expect(frameworkStart).toBeGreaterThan(-1);
    expect(frameworkEnd).toBeGreaterThan(frameworkStart);
    expect(frameworkSource).toContain('columns="twoToThree"');
    expect(editorSource).toContain('twoToThree: "grid-cols-2 lg:grid-cols-3"');
    expect(editorSource).toContain("whitespace-normal break-words");
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
    expect(editorSource).toContain("<TherapistProfileView therapist={previewData} interactive={false} />");
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
    expect(editorSource).toContain('className="mx-auto box-border w-full min-w-0 max-w-6xl"');
  });
});

describe("profile management action placement", () => {
  it("keeps publishing, freezing and reactivation in the overview rather than the therapist editor", () => {
    const actionsStart = editorSource.indexOf("function ProfileActions(");
    const actionsEnd = editorSource.indexOf("function Section(", actionsStart);
    const actionsSource = editorSource.slice(actionsStart, actionsEnd);

    expect(editorSource).not.toContain("setMyProfileVisibility");
    expect(actionsSource).not.toContain("הקפאת הפרופיל");
    expect(actionsSource).not.toContain("הפעלת הפרופיל מחדש");
    expect(overviewSource).toContain("setMyProfileVisibility");
    expect(overviewSource).toContain("publishMyProfile");
    expect(onboardingCardSource).toContain("פרסום הפרופיל");
    expect(onboardingCardSource).toContain("הקפאת הפרופיל");
    expect(onboardingCardSource).toContain("הפעלת הפרופיל מחדש");
  });

  it("keeps the therapist editor focused on previewing and saving professional details", () => {
    const actionsStart = editorSource.indexOf("function ProfileActions(");
    const actionsEnd = editorSource.indexOf("function Section(", actionsStart);
    const actionsSource = editorSource.slice(actionsStart, actionsEnd);

    expect(editorSource).toContain("allowPublishing={isAdmin}");
    expect(actionsSource).toContain('allowPublishing ? "שמירה ופרסום" : "שמירת הפרופיל"');
    expect(actionsSource).toContain("תצוגה מקדימה");
    expect(actionsSource).toContain("שמירת פרופיל");
    expect(actionsSource).toContain("כל שדות החובה בפרופיל המקצועי הושלמו.");
    expect(actionsSource).toContain("חזרה למסך הסקירה");
    expect(actionsSource).toContain("{allowPublishing && (");
  });
});

describe("account ownership of contact preferences and deletion", () => {
  it("keeps permanent profile deletion at the bottom of the editor behind a preliminary native disclosure", () => {
    expect(editorSource).toContain("<DeleteProfilePanel");
    expect(settingsSource).not.toContain("deleteMyProfilePermanently");

    const detailsOpen = deleteProfilePanelSource.indexOf('<details className="group">');
    const summary = deleteProfilePanelSource.indexOf("אפשרויות מחיקת הפרופיל", detailsOpen);
    const destructiveButton = deleteProfilePanelSource.indexOf('variant="destructive"', summary);
    const detailsClose = deleteProfilePanelSource.indexOf("</details>", destructiveButton);

    expect(detailsOpen).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(detailsOpen);
    expect(destructiveButton).toBeGreaterThan(summary);
    expect(detailsClose).toBeGreaterThan(destructiveButton);
  });

  it("retains the final profile-deletion safeguards in the editor", () => {
    expect(deleteProfilePanelSource).toContain("ברור לי שהמחיקה היא לצמיתות");
    expect(deleteProfilePanelSource).toContain("confirmation !== phrase");
    expect(deleteProfilePanelSource).toContain("כן, מחיקת הפרופיל לצמיתות");
  });

  it("defaults new profiles to email and manages channel choices from the leads area", () => {
    expect(editorSource).toContain('contact_methods: ["email"]');
    expect(editorSource).toContain('preferred_contact_method: "email"');
    expect(editorSource).not.toContain("CONTACT_METHOD_OPTIONS");
    expect(settingsSource).not.toContain("CONTACT_METHOD_OPTIONS");
    expect(contactPreferencesSource).toContain("CONTACT_METHOD_OPTIONS");
    expect(contactPreferencesSource).toContain("updateMyContactPreferences");
  });

  it("shows contact preferences as a read-only summary with a direct leads shortcut", () => {
    expect(editorSource).toContain("function ContactPreferencesSummary");
    expect(editorSource).toContain("ערוצים פעילים");
    expect(editorSource).toContain("ערוץ מועדף");
    expect(editorSource).toContain('to="/account/leads"');
    expect(editorSource).toContain("ניהול דרכי התקשרות");

    const summaryStart = editorSource.indexOf("function ContactPreferencesSummary");
    const summaryEnd = editorSource.indexOf("function ProfileActions", summaryStart);
    const summarySource = editorSource.slice(summaryStart, summaryEnd);

    expect(summaryStart).toBeGreaterThan(-1);
    expect(summaryEnd).toBeGreaterThan(summaryStart);
    expect(summarySource).not.toContain("CONTACT_METHOD_OPTIONS");
    expect(summarySource).not.toContain("onCheckedChange");
    expect(contactPreferencesSource).toContain("CONTACT_METHOD_OPTIONS");
  });

  it("does not let hidden contact preferences block profile publishing", () => {
    const gateStart = editorSource.indexOf("const publishMissing =");
    const gateEnd = editorSource.indexOf("const previewData", gateStart);
    const gateSource = editorSource.slice(gateStart, gateEnd);

    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    expect(gateSource).not.toContain("contact_methods");
    expect(gateSource).not.toContain("preferred_contact_method");
    expect(gateSource).not.toContain("form.email");
    expect(gateSource).not.toContain("form.phone");
    expect(editorSource).toContain("resolveEditorContactPreferences(form, defaultEmail)");
  });

  it("shows saving and publishing progress only on the action that is actually running", () => {
    expect(editorSource).toContain(
      'pendingAction={mutation.isPending ? (mutation.variables ? "publish" : "save") : null}',
    );
    expect(editorSource).toContain('pendingAction === "save" ? "מתבצעת שמירה…" : "שמירת פרופיל"');
    expect(editorSource).toContain('pendingAction === "publish" ? "מתבצע פרסום…" : "פרסום פרופיל"');
  });

  it("requires an inferred treatment domain, keeps experience optional and only reveals missing fields after saving", () => {
    expect(editorSource).toContain("לפרסום הפרופיל נדרש לפחות תחום טיפול אחד שהמערכת מזהה בתיאור");
    expect(editorSource).toContain("זוהה לפחות תחום טיפול אחד");
    expect(editorSource).toContain("hasRecognizedTreatmentDomain");
    expect(editorSource).toContain('<Field label="שנות ניסיון (לא חובה)">');
    expect(editorSource).not.toContain("DESCRIPTION_MIN");
    expect(editorSource).not.toContain('<Field label="שנות ניסיון *">');
    expect(editorSource).toContain("const [showPublishMissing, setShowPublishMissing] = useState(false)");
    expect(editorSource).toContain("setShowPublishMissing(true)");
    expect(editorSource).toContain("publishMissingFields={publishMissingFields}");
    expect(editorSource).toContain("showPublishMissing={showPublishMissing}");
    expect(editorSource).toContain("כדי להשלים את פרטי הפרופיל יש למלא:");
    expect(editorSource).not.toContain("כדי לפרסם את הפרופיל יש להשלים:");
    expect(editorSource).not.toContain("אורך התיאור טוב");
  });
});

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClinicLocationsCard, visibleTagCountForRows } from "./therapist-profile-view";

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
            accessibility_features: ["step_free_entrance"],
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
        ],
      }),
    );

    expect(html.match(/טיפול בקליניקה/g)).toHaveLength(1);
    expect(html).toContain("רחובות");
    expect(html).toContain("קליניקה נגישה");
    expect(html).toContain("ראשון לציון");
    expect(html).toContain("קליניקה נגישה חלקית");
    expect(html).toContain("חולון");
    expect(html).not.toContain("step_free_entrance");
    expect(html).not.toContain("כניסה מהחניה");
    expect(html).not.toContain("<details");
  });

  it("renders nothing when no clinic locations are provided", () => {
    expect(renderToStaticMarkup(createElement(ClinicLocationsCard, { locations: [] }))).toBe("");
  });
});

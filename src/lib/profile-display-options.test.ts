import { describe, expect, it } from "bun:test";

import {
  accessibilityFeatureLabels,
  clinicAccessibilityLabel,
  freeIntroTypeLabels,
} from "./profile-display-options";

describe("profile display option labels", () => {
  it("maps accessibility features in canonical display order and ignores unknown ids", () => {
    expect(
      accessibilityFeatureLabels(["accessible_parking", "unknown", "step_free_entrance"]),
    ).toEqual(["כניסה ללא מדרגות", "חניית נכים"]);
  });

  it("maps free introductory-session types in canonical display order", () => {
    expect(freeIntroTypeLabels(["in_person", "phone", "video"])).toEqual([
      "טלפון",
      "וידאו",
      "פגישה בקליניקה",
    ]);
  });

  it("labels every meaningful public accessibility status", () => {
    expect(clinicAccessibilityLabel("accessible")).toBe("קליניקה נגישה");
    expect(clinicAccessibilityLabel("partially_accessible")).toBe("קליניקה נגישה חלקית");
    expect(clinicAccessibilityLabel("not_accessible")).toBe("הקליניקה אינה נגישה");
    expect(clinicAccessibilityLabel("unknown")).toBeNull();
  });
});

import { describe, expect, it } from "bun:test";
import { triageSearchSafety } from "./search-safety-triage";

describe("search safety triage", () => {
  it("blocks explicit suicidal/self-harm wording before classification", () => {
    for (const query of [
      "יש לי מחשבות אובדניות",
      "יש לי נטיות אובדניות",
      "אני מחפש עזרה בגלל פגיעה עצמית",
      "אני רוצה להתאבד",
      "אני לא רוצה לחיות יותר",
      "אני חושב לפגוע בעצמי",
    ]) {
      expect(triageSearchSafety(query)).toEqual({
        status: "urgent",
        reason: "self_harm_or_suicide",
      });
    }
  });

  it("blocks high-specificity acute medical wording", () => {
    for (const query of ["יש לי כאב בחזה", "אני לא מצליחה לנשום", "לקחתי מנת יתר"]) {
      expect(triageSearchSafety(query)).toEqual({
        status: "urgent",
        reason: "immediate_medical_danger",
      });
    }
  });

  it("marks ambiguous distress as watch rather than forcing a domain or blocking", () => {
    for (const query of ["אני עומד להתפרק", "לא יכולה יותר", "אין לי אוויר כבר"]) {
      expect(triageSearchSafety(query)).toEqual({
        status: "watch",
        reason: "ambiguous_distress",
      });
    }
  });

  it("does not convert ordinary panic/fear wording into an emergency solely from fear of dying", () => {
    expect(triageSearchSafety("דפיקות לב מהירות ופחד שאני עומד למות")).toEqual({
      status: "clear",
      reason: null,
    });
  });
});

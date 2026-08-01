/**
 * The two Unified empty states are distinct and must never be swapped.
 */

import { describe, expect, it } from "bun:test";
import { emptyStateMessage } from "@/routes/search";

describe("emptyStateMessage", () => {
  it("unrecognized_query explains we could not understand the request", () => {
    const m = emptyStateMessage("unrecognized_query");
    expect(m.title).toBe("לא הצלחנו להבין את הבקשה");
    expect(m.body).toContain("נסו לנסח מחדש");
  });

  it("no_matching_therapists explains nobody matched", () => {
    const m = emptyStateMessage("no_matching_therapists");
    expect(m.title).toBe("לא נמצאו מטפלים מתאימים");
    expect(m.body).toContain("להסיר סינון");
  });

  it("the two messages are distinct, and null falls back to no_matching_therapists", () => {
    expect(emptyStateMessage("unrecognized_query")).not.toEqual(
      emptyStateMessage("no_matching_therapists"),
    );
    expect(emptyStateMessage(null)).toEqual(emptyStateMessage("no_matching_therapists"));
  });
});

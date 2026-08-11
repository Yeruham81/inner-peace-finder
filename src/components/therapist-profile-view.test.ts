import { describe, expect, it } from "bun:test";

import { visibleTagCountForRows } from "./therapist-profile-view";

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

import { describe, expect, it } from "bun:test";

import { visibleItemCountForRows } from "./tag-overflow";

describe("visibleItemCountForRows", () => {
  it("shows every item when the rendered widths fit in one row", () => {
    expect(visibleItemCountForRows([45, 45, 45], 160, {}, 1, 8)).toBe(3);
  });

  it("reserves space for the exact hidden-count indicator", () => {
    const moreWidths = { 1: 70, 2: 70, 3: 70, 4: 70 };
    expect(visibleItemCountForRows([55, 55, 55, 55], 180, moreWidths, 1, 8)).toBe(1);
  });

  it("responds to measured widths rather than a fixed item count", () => {
    const moreWidths = { 1: 65, 2: 65, 3: 65, 4: 65 };
    expect(visibleItemCountForRows([35, 35, 35, 35, 35], 200, moreWidths, 1, 8)).toBe(3);
    expect(visibleItemCountForRows([90, 90, 90], 200, moreWidths, 1, 8)).toBe(1);
  });

  it("handles empty and unavailable layouts safely", () => {
    expect(visibleItemCountForRows([], 200, {}, 1, 8)).toBe(0);
    expect(visibleItemCountForRows([50], 0, { 1: 60 }, 1, 8)).toBe(0);
  });
});

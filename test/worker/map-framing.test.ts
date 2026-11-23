import { describe, expect, it } from "vitest";
import { FEW_NOTES, framingBox, MIN_SPAN, showAllLabels } from "../../src/web/mapFraming";

describe("framing the map", () => {
  it("frames a single note in a box of the minimum size, centred on it, so it never fills the screen", () => {
    expect(framingBox([{ x: 40, y: -10 }])).toEqual({ x: [40 - MIN_SPAN / 2, 40 + MIN_SPAN / 2], y: [-10 - MIN_SPAN / 2, -10 + MIN_SPAN / 2] });
  });

  it("frames notes that sit almost on top of each other around their centre", () => {
    expect(framingBox([{ x: 0, y: 0 }, { x: 2, y: 4 }])).toEqual({ x: [1 - MIN_SPAN / 2, 1 + MIN_SPAN / 2], y: [2 - MIN_SPAN / 2, 2 + MIN_SPAN / 2] });
  });

  it("leaves a spread-out map to the default fit", () => {
    expect(framingBox([{ x: 0, y: 0 }, { x: MIN_SPAN, y: 10 }])).toBeNull();
    expect(framingBox([])).toBeNull();
  });

  it("shows every label while the map holds only a few notes", () => {
    expect(showAllLabels(1)).toBe(true);
    expect(showAllLabels(FEW_NOTES)).toBe(true);
    expect(showAllLabels(FEW_NOTES + 1)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { drift, DRIFT_LIMIT, pulseBudget, seedOf, springBack } from "../../src/web/networkMotion";
import { FRAME_PAD, fixedFrame, MIN_SPAN } from "../../src/web/mapFraming";

describe("network motion", () => {
  it("gives each note its own stable seed", () => {
    expect(seedOf("note-a")).toBe(seedOf("note-a"));
    expect(seedOf("note-a")).not.toBe(seedOf("note-b"));
    expect(seedOf("x")).toBeGreaterThanOrEqual(0);
    expect(seedOf("x")).toBeLessThan(1);
  });

  it("drifts a note only within the given amplitude, and moves it over time", () => {
    for (let t = 0; t < 60; t += 0.7) {
      const { dx, dy } = drift(0.3, t, 5);
      expect(Math.abs(dx)).toBeLessThanOrEqual(5);
      expect(Math.abs(dy)).toBeLessThanOrEqual(5);
    }
    expect(drift(0.3, 0, 5)).not.toEqual(drift(0.3, 3, 5));
    expect(drift(0.3, 2, 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("only drifts maps up to a size the browser can repaint every frame", () => {
    expect(DRIFT_LIMIT).toBeGreaterThanOrEqual(1000);
  });

  it("springs a dragged note back from where it was dropped to its place", () => {
    const from = { x: 100, y: -40 };
    const to = { x: 0, y: 0 };
    expect(springBack(from, to, 0)).toEqual(from);
    expect(springBack(from, to, 1)).toEqual(to);
    const mid = springBack(from, to, 0.5);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(100);
  });

  it("sends more signals on a bigger map, never more than there are links, up to a ceiling", () => {
    expect(pulseBudget(0)).toBe(0);
    expect(pulseBudget(3)).toBe(3);
    expect(pulseBudget(900)).toBeGreaterThan(pulseBudget(100));
    expect(pulseBudget(1_000_000)).toBeLessThanOrEqual(120);
  });
});

describe("a fixed frame for a moving map", () => {
  it("frames a spread-out map to the extent of its resting positions, with room around the edge notes", () => {
    const pad = 800 * FRAME_PAD;
    expect(fixedFrame([{ x: -300, y: 10 }, { x: 500, y: 90 }])).toEqual({ x: [-300 - pad, 500 + pad], y: [10 - pad, 90 + pad] });
  });

  it("keeps the minimum frame for a lone note", () => {
    expect(fixedFrame([{ x: 0, y: 0 }])).toEqual({ x: [-MIN_SPAN / 2, MIN_SPAN / 2], y: [-MIN_SPAN / 2, MIN_SPAN / 2] });
    expect(fixedFrame([])).toBeNull();
  });
});

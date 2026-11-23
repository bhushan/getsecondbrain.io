/**
 * The motion math for the Network: a slow drift per note, the spring back after a drag, and how many
 * signals travel at once. Pure functions, so the animation loop stays a thin layer over them.
 */

/** Above this many notes the map stops drifting (repainting every note each frame gets heavy); signals still run. */
export const DRIFT_LIMIT = 2000;

/** A stable number in [0, 1) for a note id. */
export function seedOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** Where a note sits relative to its resting place at time `t` (seconds): a slow loop of `amp` units at most. */
export function drift(seed: number, t: number, amp: number): { dx: number; dy: number } {
  if (amp === 0) return { dx: 0, dy: 0 };
  const phase = seed * Math.PI * 2;
  // Periods between 8 and 14 seconds, different per note, so the field never moves in step.
  const wx = (Math.PI * 2) / (8 + seed * 6);
  const wy = (Math.PI * 2) / (9 + ((seed * 7.3) % 1) * 5);
  return { dx: amp * Math.sin(t * wx + phase), dy: amp * Math.cos(t * wy + phase * 1.7) };
}

/** A dropped note on its way home: `progress` runs 0 to 1, eased out with a slight overshoot. */
export function springBack(from: { x: number; y: number }, to: { x: number; y: number }, progress: number): { x: number; y: number } {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const c = 0.8;
  const p = progress - 1;
  const eased = 1 + (c + 1) * p * p * p + c * p * p;
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
}

/** How many signals travel at once: grows with the number of links, never more than there are links. */
export function pulseBudget(edges: number): number {
  if (edges <= 0) return 0;
  return Math.min(edges, 120, Math.max(6, Math.round(Math.sqrt(edges) * 3)));
}

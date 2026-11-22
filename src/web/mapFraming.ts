/**
 * Framing for the map. The map library scales the view to the spread of the notes, so a lone note
 * (no spread at all) or a few notes almost on one spot get blown up to fill the screen. Such maps get
 * a frame of a minimum size instead, centred on the notes.
 */

type Extent = [number, number];

/** The smallest spread, in layout units, the map is framed to. */
export const MIN_SPAN = 200;
/** Up to this many notes, every label is shown: there is room, and a bare dot says nothing. More, and long titles collide. */
export const FEW_NOTES = 10;

/** A box of at least MIN_SPAN around the notes, or null when they are spread out enough to fit as usual. */
export function framingBox(points: { x: number; y: number }[]): { x: Extent; y: Extent } | null {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (Math.max(maxX - minX, maxY - minY) >= MIN_SPAN) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const half = MIN_SPAN / 2;
  return { x: [cx - half, cx + half], y: [cy - half, cy + half] };
}

export const showAllLabels = (notes: number) => notes <= FEW_NOTES;

/**
 * The frame for a map whose notes move a little on screen (drift, dragging): the extent of their
 * resting positions, or the minimum frame. Fixing it keeps the whole view from swaying with them.
 */
export function fixedFrame(points: { x: number; y: number }[]): { x: Extent; y: Extent } | null {
  if (!points.length) return null;
  const small = framingBox(points);
  if (small) return small;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Room around the edge notes for their glow, their drift and their labels.
  const pad = Math.max(maxX - minX, maxY - minY) * FRAME_PAD;
  return { x: [minX - pad, maxX + pad], y: [minY - pad, maxY + pad] };
}

/** Share of the map's span kept free around a fixed frame. */
export const FRAME_PAD = 0.08;

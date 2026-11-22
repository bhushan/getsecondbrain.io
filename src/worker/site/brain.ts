/*
 * The brain behind the hero network: a few hundred neurons filling a side view of a brain (cerebrum,
 * temporal lobe, cerebellum and stem), each linked to its nearest neighbours. It is built once from a
 * fixed seed, so every load draws the same brain. The markup alone is a still image; site.js reads the
 * neurons and links from it and brings them to life on a canvas.
 */

export type BrainTint = "violet" | "sky" | "fuchsia" | "amber" | "teal";
export interface Neuron {
  x: number;
  y: number;
  r: number;
  tint: BrainTint;
}

const WIDTH = 1200;
const HEIGHT = 600;
const SPACING = 17;
const MAX_NEURONS = 520;
const LINKS_PER_NEURON = 3;
const LINK_REACH = 46;
/** How close to the edge a neuron counts as part of the rim. */
const RIM = 12;

/** mulberry32: a small seeded random number generator. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** The lateral fissure, a dark furrow between the temporal lobe and the rest, from front to back. */
const fissure = (x: number) => 338 - (x - 390) * 0.16;

/** Which part of the brain a point is in, or null outside it. The front of the brain faces left. */
function region(x: number, y: number): BrainTint | null {
  if (inEllipse(x, y, 868, 448, 148, 82)) return "teal";
  if (inEllipse(x, y, 748, 520, 40, 76) && y > 470) return "teal";
  const cerebrum = inEllipse(x, y, 590, 268, 452, y < 268 ? 228 : 182) || inEllipse(x, y, 545, 392, 262, 96);
  if (!cerebrum) return null;
  if (x > 390 && x < 800 && Math.abs(y - fissure(x)) < 7) return null;
  if (x > 390 && x < 820 && y > fissure(x)) return "fuchsia";
  if (x < 455) return "violet";
  if (x > 815) return "amber";
  return "sky";
}

/** Folds: neurons crowd along winding ridges, like the gyri on a real cortex. */
const fold = (x: number, y: number) => Math.abs(Math.sin((x - 590) * 0.04 + Math.sin(y * 0.034) * 2.3) * Math.cos(y * 0.046 + Math.sin(x * 0.021) * 1.6));

export function buildBrain(seed = 20261123): { neurons: Neuron[]; links: [number, number][] } {
  const rand = random(seed);
  const neurons: Neuron[] = [];
  const cell = SPACING;
  const grid = new Map<string, number[]>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;
  for (let tries = 0; tries < 40_000 && neurons.length < MAX_NEURONS; tries++) {
    const x = 40 + rand() * (WIDTH - 80);
    const y = 24 + rand() * (HEIGHT - 48);
    const tint = region(x, y);
    if (!tint) continue;
    // The rim (the cortex outline) is always kept, so the brain's shape reads at a glance.
    const rim = [[RIM, 0], [-RIM, 0], [0, RIM], [0, -RIM]].some(([dx, dy]) => region(x + dx!, y + dy!) === null);
    if (!rim && rand() > 0.3 + 0.7 * fold(x, y)) continue;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let crowded = false;
    for (let dx = -1; dx <= 1 && !crowded; dx++)
      for (let dy = -1; dy <= 1 && !crowded; dy++)
        for (const other of grid.get(key(gx + dx, gy + dy)) ?? []) {
          const n = neurons[other]!;
          if ((n.x - x) ** 2 + (n.y - y) ** 2 < SPACING ** 2) crowded = true;
        }
    if (crowded) continue;
    grid.set(key(gx, gy), [...(grid.get(key(gx, gy)) ?? []), neurons.length]);
    neurons.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round((1.1 + rand() * rand() * 2.4) * 10) / 10, tint });
  }

  // Each neuron links to its nearest few, never across the fissure's gap or out of reach.
  const seen = new Set<string>();
  const links: [number, number][] = [];
  const reach = Math.ceil(LINK_REACH / cell);
  neurons.forEach((n, i) => {
    const gx = Math.floor(n.x / cell);
    const gy = Math.floor(n.y / cell);
    const near: { j: number; d: number }[] = [];
    for (let dx = -reach; dx <= reach; dx++)
      for (let dy = -reach; dy <= reach; dy++)
        for (const j of grid.get(key(gx + dx, gy + dy)) ?? []) {
          if (j === i) continue;
          const d = Math.hypot(neurons[j]!.x - n.x, neurons[j]!.y - n.y);
          if (d <= LINK_REACH) near.push({ j, d });
        }
    near.sort((a, b) => a.d - b.d);
    for (const { j } of near.slice(0, LINKS_PER_NEURON)) {
      const id = i < j ? `${i},${j}` : `${j},${i}`;
      if (seen.has(id)) continue;
      seen.add(id);
      links.push(i < j ? [i, j] : [j, i]);
    }
  });
  return { neurons, links };
}

/** The brain as SVG: one path for every link, then the neurons, tinted by region. */
export function brainSvg(): string {
  const { neurons, links } = buildBrain();
  const d = links.map(([a, b]) => `M${neurons[a]!.x} ${neurons[a]!.y}L${neurons[b]!.x} ${neurons[b]!.y}`).join("");
  const dots = neurons.map((n) => `<circle class="bn b-${n.tint}" cx="${n.x}" cy="${n.y}" r="${n.r}"/>`).join("");
  return `<g class="brain" aria-hidden="true" data-edges="${links.map(([a, b]) => `${a},${b}`).join(";")}"><path class="brain-links" d="${d}"/>${dots}</g>`;
}

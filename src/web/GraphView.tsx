import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { inferSettings } from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Sigma from "sigma";
import { api, type GraphData } from "./api";
import { fixedFrame, showAllLabels } from "./mapFraming";
import { drift, DRIFT_LIMIT, pulseBudget, seedOf, springBack } from "./networkMotion";

/**
 * The Network: every note as a neuron on a deep-space field, links as axons, and small signals of
 * light travelling along real links. Always dark, whatever the app theme, because glow only reads on
 * dark. Sigma draws on WebGL, so colours are values rather than CSS variables.
 */
const NETWORK = {
  /** One tint per cluster of closely linked notes, around the aurora brand. */
  communities: ["#a39bff", "#e49af3", "#ffc06b", "#7dbdf0", "#6fd0b2", "#c5a9ff", "#f4a5a5", "#9fb4ff"],
  focus: "#b9b0ff",
  dim: "#221f45",
  edge: "rgba(150, 140, 255, 0.16)",
  edgeQuiet: "rgba(150, 140, 255, 0.06)",
  edgeActive: "rgba(170, 160, 255, 0.85)",
  label: "#c9c6e8",
  labelStrong: "#ffffff",
  backdrop: "rgba(14, 12, 36, 0.94)",
  backdropBorder: "rgba(139, 125, 255, 0.4)",
  backdropShadow: "rgba(0, 0, 0, 0.7)",
  signalCore: "#fff6e0",
};

const LABEL_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
/** Signals take this long to cross one link, in milliseconds, give or take a third. */
const SIGNAL_MS = 1000;
const SPRING_MS = 650;
const FLASH_MS = 520;
/** Halos are drawn for every note up to this size; beyond it only for the open note and search hits. */
const HALO_LIMIT = 4000;

export interface GraphHandle {
  /** Centres a note in the part of the map not covered by `inset` (pixels hidden on the right and at the bottom). */
  focus(id: string, inset?: { right: number; bottom: number }): void;
  relayout(): void;
  /** Every note path on the map, to name a new note. */
  paths(): string[];
}

interface Props {
  version: number;
  selected: string | null;
  highlighted: Set<string>;
  /** False while another page covers the Network: the animation stops. */
  active: boolean;
  onSelect(id: string | null): void;
  onStats(stats: { nodes: number; edges: number; laying: boolean }): void;
}

interface Signal {
  from: string;
  to: string;
  born: number;
  duration: number;
  color: string;
}
interface Flash {
  node: string;
  born: number;
  color: string;
}

/** Places a node with no saved position next to its placed neighbours, or on a ring. */
function seedPosition(graph: Graph, node: string, index: number, total: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let placed = 0;
  graph.forEachNeighbor(node, (_, attrs) => {
    if (attrs.placed) {
      x += attrs.x;
      y += attrs.y;
      placed++;
    }
  });
  if (placed) return { x: x / placed + (Math.random() - 0.5) * 4, y: y / placed + (Math.random() - 0.5) * 4 };
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const radius = 40 + Math.sqrt(total) * 6 * Math.random();
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function buildGraph(data: GraphData): { graph: Graph; missing: number } {
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  data.ids.forEach((id, i) => {
    const x = data.positions[2 * i];
    const y = data.positions[2 * i + 1];
    const placed = x != null && y != null;
    const path = data.paths[i]!;
    graph.addNode(id, { label: path.split("/").pop(), path, x: placed ? x : 0, y: placed ? y : 0, placed, seed: seedOf(id) });
  });
  for (let k = 0; k < data.edges.length; k += 2) {
    graph.mergeEdge(data.ids[data.edges[k]!]!, data.ids[data.edges[k + 1]!]!);
  }
  let missing = 0;
  let index = 0;
  graph.forEachNode((node, attrs) => {
    if (!attrs.placed) {
      graph.mergeNodeAttributes(node, { ...seedPosition(graph, node, index, graph.order), placed: true });
      missing++;
    }
    index++;
  });
  const labelled = showAllLabels(graph.order);
  graph.forEachNode((node) => graph.mergeNodeAttributes(node, { size: 2 + Math.sqrt(graph.degree(node)) * 1.25, forceLabel: labelled }));
  if (graph.size > 0) {
    louvain.assign(graph, { nodeCommunityAttribute: "community" });
  }
  return { graph, missing };
}

const colorOf = (graph: Graph, node: string) => NETWORK.communities[((graph.getNodeAttribute(node, "community") as number) ?? 0) % NETWORK.communities.length]!;

/** "#rrggbb" with an alpha, for canvas gradients (which do not take every CSS colour syntax). */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** A soft round glow in one colour, drawn once and stamped for every halo and signal. */
const sprites = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  const known = sprites.get(color);
  if (known) return known;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, rgba(color, 1));
  gradient.addColorStop(0.25, rgba(color, 0.55));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  sprites.set(color, canvas);
  return canvas;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)");

/** The whole workspace as a living WebGL network. Positions are computed once in a worker, then saved. */
export const GraphView = forwardRef<GraphHandle, Props>(function GraphView({ version, selected, highlighted, active, onSelect, onStats }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({ selected, highlighted, onSelect, onStats });
  state.current = { selected, highlighted, onSelect, onStats };
  /** The open note and its neighbours, worked out once per change instead of once per node per frame. */
  const neighbourhood = useRef<{ key: string | null; set: Set<string> | null }>({ key: null, set: null });
  const selectedNeighbourhood = (graph: Graph): Set<string> | null => {
    const { selected } = state.current;
    const key = selected && graph.hasNode(selected) ? `${selected}:${graph.order}:${graph.size}` : null;
    if (neighbourhood.current.key !== key) neighbourhood.current = { key, set: key ? new Set([selected!, ...graph.neighbors(selected!)]) : null };
    return neighbourhood.current.set;
  };
  const [error, setError] = useState<string | null>(null);

  /** Everything the animation reads each frame. Never React state: a frame must not re-render React. */
  const motion = useRef({
    clock: 0,
    amp: 0,
    laying: false,
    animate: false,
    signals: [] as Signal[],
    flashes: [] as Flash[],
    springs: new Map<string, { from: { x: number; y: number }; start: number }>(),
    dragOffset: { x: 0, y: 0 },
    dragged: false,
    /** When the last drag ended: a click right after it is the release, not a click. */
    dragEndedAt: 0,
    frame: 0,
    /** The links as a list, kept once per map so picking a random one costs nothing per signal. */
    edges: [] as string[],
    nodes: [] as string[],
  });

  /** Where a note is drawn right now: its resting place plus drift, unless it is held or springing back. */
  const displayedAt = (graph: Graph, node: string) => {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.dragX != null) return { x: attrs.dragX as number, y: attrs.dragY as number };
    const m = motion.current;
    if (!m.amp) return { x: attrs.x as number, y: attrs.y as number };
    const d = drift(attrs.seed as number, m.clock, m.amp);
    return { x: (attrs.x as number) + d.dx, y: (attrs.y as number) + d.dy };
  };

  const stopLayout = () => {
    window.clearTimeout(timerRef.current);
    layoutRef.current?.kill();
    layoutRef.current = null;
    motion.current.laying = false;
  };

  /**
   * Fixes the frame to the notes' resting positions. Sigma otherwise refits the view to wherever the
   * nodes are drawn, and the whole map would sway with the drift.
   */
  const frame = (sigma: Sigma, graph: Graph) => {
    const points: { x: number; y: number }[] = [];
    graph.forEachNode((_, attrs) => points.push({ x: attrs.x, y: attrs.y }));
    const box = fixedFrame(points);
    sigma.setCustomBBox(box);
    const span = box ? Math.max(box.x[1] - box.x[0], box.y[1] - box.y[0]) : 0;
    motion.current.amp = graph.order <= DRIFT_LIMIT && !reducedMotion().matches ? span * 0.007 : 0;
  };

  const savePositions = (graph: Graph, ids: string[]) => {
    const positions: number[] = [];
    for (const id of ids) positions.push(graph.getNodeAttribute(id, "x"), graph.getNodeAttribute(id, "y"));
    api.saveLayout(ids, positions).catch(() => undefined);
  };

  const runLayout = (graph: Graph, ids: string[]) => {
    stopLayout();
    const settings = { ...inferSettings(graph), barnesHutOptimize: graph.order > 1500, slowDown: 4 };
    // While the notes spread out, the view follows them and they do not drift; the frame is fixed again after.
    sigmaRef.current?.setCustomBBox(null);
    motion.current.laying = true;
    motion.current.amp = 0;
    const layout = new FA2Layout(graph, { settings });
    layoutRef.current = layout;
    layout.start();
    state.current.onStats({ nodes: graph.order, edges: graph.size, laying: true });
    const duration = Math.min(9000, 1500 + graph.order * 1.2);
    timerRef.current = window.setTimeout(() => {
      if (layoutRef.current !== layout) return;
      stopLayout();
      if (sigmaRef.current) frame(sigmaRef.current, graph);
      state.current.onStats({ nodes: graph.order, edges: graph.size, laying: false });
      savePositions(graph, ids);
    }, duration);
  };

  /** The open note and its neighbours, or the search hits: the part of the network in focus, or null. */
  const focusSet = (graph: Graph): Set<string> | null => {
    const { selected, highlighted } = state.current;
    if (highlighted.size) return highlighted;
    return selectedNeighbourhood(graph);
  };

  /** Starts a signal on a real link, preferring the part of the network in focus. */
  const fire = (graph: Graph, now: number, from?: string) => {
    if (graph.size === 0) return;
    const m = motion.current;
    let source = from;
    let target: string | undefined;
    if (source) {
      const next = graph.neighbors(source);
      if (!next.length) return;
      target = next[Math.floor(Math.random() * next.length)];
    } else {
      const focus = focusSet(graph);
      const { selected } = state.current;
      if (selected && graph.hasNode(selected) && graph.degree(selected) > 0 && Math.random() < 0.6) {
        const next = graph.neighbors(selected);
        const other = next[Math.floor(Math.random() * next.length)]!;
        [source, target] = Math.random() < 0.5 ? [selected, other] : [other, selected];
      } else if (focus && focus.size > 1 && Math.random() < 0.6) {
        const pool = [...focus];
        const start = pool[Math.floor(Math.random() * pool.length)]!;
        const inside = graph.neighbors(start).filter((n) => focus.has(n));
        if (inside.length) [source, target] = [start, inside[Math.floor(Math.random() * inside.length)]!];
      }
      if (!source || !target) {
        const edge = m.edges[Math.floor(Math.random() * m.edges.length)];
        if (!edge) return;
        const [a, b] = graph.extremities(edge);
        [source, target] = Math.random() < 0.5 ? [a, b] : [b, a];
      }
    }
    if (!source || !target) return;
    m.signals.push({ from: source, to: target, born: now, duration: SIGNAL_MS * (0.65 + Math.random() * 0.7), color: colorOf(graph, source) });
  };

  /** Draws halos, signals and arrival flashes on the layer under the WebGL nodes. */
  const paint = (now: number) => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    const canvas = overlayRef.current;
    if (!sigma || !graph || !canvas) return;
    const { width, height } = sigma.getDimensions();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    const m = motion.current;
    const focus = focusSet(graph);
    // Positions straight from the motion state: copying sigma's display data for every node each frame is the costliest step.
    const screen = (node: string) => {
      if (!graph.hasNode(node)) return null;
      const at = sigma.graphToViewport(displayedAt(graph, node));
      return { x: at.x, y: at.y, r: sigma.scaleSize(graph.getNodeAttribute(node, "size") as number) };
    };
    const t = now / 1000;

    // Halos: each neuron glows in its cluster colour, breathing slowly when the network is alive.
    graph.forEachNode((node, attrs) => {
      const inFocus = focus?.has(node) ?? false;
      if (graph.order > HALO_LIMIT && !inFocus) return;
      const at = screen(node);
      if (!at || at.x < -40 || at.y < -40 || at.x > width + 40 || at.y > height + 40) return;
      const breathe = m.animate ? 0.82 + 0.18 * Math.sin(t * 0.9 + (attrs.seed as number) * 6.283) : 1;
      const strength = focus ? (inFocus ? 0.85 : 0.05) : 0.42;
      const size = Math.max(16, at.r * (inFocus && node === state.current.selected ? 14 : 9));
      ctx.globalAlpha = strength * breathe;
      ctx.drawImage(glow(colorOf(graph, node)), at.x - size / 2, at.y - size / 2, size, size);
    });

    // Signals: a hot core with a tail, travelling from one neuron to the next.
    for (const signal of m.signals) {
      const a = screen(signal.from);
      const b = screen(signal.to);
      if (!a || !b) continue;
      const progress = (now - signal.born) / signal.duration;
      const quiet = focus && !(focus.has(signal.from) && focus.has(signal.to));
      const alpha = quiet ? 0.18 : 1;
      const halo = glow(signal.color);
      for (let k = 6; k >= 0; k--) {
        const p = progress - k * 0.035;
        if (p < 0 || p > 1) continue;
        const x = a.x + (b.x - a.x) * p;
        const y = a.y + (b.y - a.y) * p;
        const fade = 1 - k / 7;
        const size = (k === 0 ? 22 : 14) * fade;
        ctx.globalAlpha = alpha * fade * 0.9;
        ctx.drawImage(halo, x - size / 2, y - size / 2, size, size);
        if (k === 0) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = NETWORK.signalCore;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Arrival flashes: a ring that widens and fades where a signal lands.
    ctx.lineWidth = 1.2;
    for (const flash of m.flashes) {
      const at = screen(flash.node);
      if (!at) continue;
      const p = (now - flash.born) / FLASH_MS;
      if (p < 0 || p > 1) continue;
      const quiet = focus && !focus.has(flash.node);
      ctx.globalAlpha = (1 - p) * (quiet ? 0.2 : 0.8);
      ctx.strokeStyle = flash.color;
      ctx.beginPath();
      ctx.arc(at.x, at.y, at.r + 2 + p * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  useImperativeHandle(ref, () => ({
    focus(id, inset = { right: 0, bottom: 0 }) {
      const sigma = sigmaRef.current;
      const data = sigma?.getNodeDisplayData(id);
      if (!sigma || !data) return;
      const reduce = reducedMotion().matches;
      const target = { ...sigma.getCamera().getState(), x: data.x, y: data.y, ratio: 0.35 };
      // Move the camera by half the covered area, so the note sits in the middle of what stays visible.
      const origin = sigma.viewportToFramedGraph({ x: 0, y: 0 }, { cameraState: target });
      const shifted = sigma.viewportToFramedGraph({ x: inset.right / 2, y: inset.bottom / 2 }, { cameraState: target });
      target.x += shifted.x - origin.x;
      target.y += shifted.y - origin.y;
      sigma.getCamera().animate(target, { duration: reduce ? 0 : 500 });
    },
    relayout() {
      const graph = graphRef.current;
      if (graph) runLayout(graph, graph.nodes());
    },
    paths() {
      const graph = graphRef.current;
      return graph ? graph.mapNodes((_, attrs) => attrs.path as string) : [];
    },
  }));

  useEffect(() => {
    let cancelled = false;
    api
      .graph()
      .then((data) => {
        if (cancelled || !container.current) return;
        const { graph, missing } = buildGraph(data);
        // Keep the view where it was when the map reloads after a save.
        const camera = sigmaRef.current?.getCamera().getState();
        stopLayout();
        sigmaRef.current?.kill();
        motion.current.signals = [];
        motion.current.flashes = [];
        motion.current.springs.clear();
        motion.current.edges = graph.edges();
        motion.current.nodes = graph.nodes();
        graphRef.current = graph;
        const sigma = new Sigma(graph, container.current, {
          settings: {
            labelRenderedSizeThreshold: 7,
            labelDensity: 0.6,
            hideEdgesOnMove: graph.size > 20000,
            antialiasEdges: graph.size < 20000,
            minCameraRatio: 0.03,
            maxCameraRatio: 8,
            // Panning stops before the network leaves the screen, so it can never be lost.
            cameraPanBoundaries: true,
            enableNodeDrag: true,
            // A drag moves where the note is drawn, never its saved position.
            dragPositionToAttributes: (position) => ({ dragX: position.x + motion.current.dragOffset.x, dragY: position.y + motion.current.dragOffset.y }),
          },
          nodeReducer: (node, display, attrs, nodeState) => {
            const { selected, highlighted } = state.current;
            const colors = NETWORK;
            const at = displayedAt(graph, node);
            const focus = selectedNeighbourhood(graph);
            const result: Partial<typeof display> = {
              x: at.x,
              y: at.y,
              color: colors.communities[((attrs.community as number) ?? 0) % colors.communities.length],
              labelColor: colors.label,
              labelFont: LABEL_FONT,
              labelSize: 12,
              backdropColor: colors.backdrop,
              backdropBorderColor: colors.backdropBorder,
              backdropBorderWidth: 1,
              backdropShadowColor: colors.backdropShadow,
              backdropShadowBlur: 18,
              backdropCornerRadius: 6,
            };
            const lit = { color: colors.focus, labelColor: colors.labelStrong, labelVisibility: "visible" as const, zIndex: 2 };
            const dim = { color: colors.dim, label: null };
            if (highlighted.size) {
              if (highlighted.has(node)) Object.assign(result, lit, node === selected && { size: display.size * 1.5 });
              else Object.assign(result, dim);
            } else if (focus) {
              if (node === selected) Object.assign(result, lit, { size: display.size * 1.5 });
              else if (focus.has(node)) Object.assign(result, { labelColor: colors.labelStrong, labelVisibility: "visible", zIndex: 1 });
              else Object.assign(result, dim);
            }
            if (nodeState.isHovered || nodeState.isDragged) Object.assign(result, { labelVisibility: "visible", labelColor: colors.labelStrong, zIndex: 3 });
            return result;
          },
          edgeReducer: (edge) => {
            const { selected, highlighted } = state.current;
            if (selected && graph.hasNode(selected) && graph.hasExtremity(edge, selected)) return { color: NETWORK.edgeActive, size: 1.4 };
            if (selected || highlighted.size) return { color: NETWORK.edgeQuiet, size: 0.4 };
            return { color: NETWORK.edge, size: 0.6 };
          },
        });

        const overlay = sigma.createLayer<HTMLCanvasElement>("synapses", "canvas", { beforeLayer: "stage", style: { pointerEvents: "none", inset: "0" } });
        overlayRef.current = overlay;
        sigma.on("afterRender", () => paint(performance.now()));

        sigma.on("nodeDragStart", ({ node }) => {
          const attrs = graph.getNodeAttributes(node);
          const shown = displayedAt(graph, node);
          motion.current.springs.delete(node);
          motion.current.dragOffset = { x: shown.x - (attrs.x as number), y: shown.y - (attrs.y as number) };
          motion.current.dragged = false;
        });
        sigma.on("nodeDrag", () => {
          motion.current.dragged = true;
        });
        sigma.on("nodeDragEnd", ({ node }) => {
          if (motion.current.dragged) motion.current.dragEndedAt = performance.now();
          motion.current.dragged = false;
          const attrs = graph.getNodeAttributes(node);
          if (attrs.dragX == null) return;
          if (!motion.current.animate) {
            graph.removeNodeAttribute(node, "dragX");
            graph.removeNodeAttribute(node, "dragY");
            return;
          }
          motion.current.springs.set(node, { from: { x: attrs.dragX as number, y: attrs.dragY as number }, start: performance.now() });
        });
        sigma.on("clickNode", ({ node }) => {
          // Letting go after a drag is not a click.
          if (performance.now() - motion.current.dragEndedAt < 300) return;
          state.current.onSelect(node);
        });
        sigma.on("clickStage", () => performance.now() - motion.current.dragEndedAt >= 300 && state.current.onSelect(null));

        frame(sigma, graph);
        if (camera) sigma.getCamera().setState(camera);
        sigmaRef.current = sigma;
        state.current.onStats({ nodes: graph.order, edges: graph.size, laying: false });
        // A few new notes sit beside their neighbours; only a mostly unplaced map gets a full layout.
        const fewNew = missing <= Math.max(3, graph.order * 0.02) && missing < graph.order;
        if (missing > 0 && fewNew) savePositions(graph, data.ids);
        else if (missing > 0 && graph.order > 1) runLayout(graph, data.ids);
      })
      .catch((cause: Error) => !cancelled && setError(cause.message));
    return () => {
      cancelled = true;
      stopLayout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(
    () => () => {
      stopLayout();
      sigmaRef.current?.kill();
      sigmaRef.current = null;
    },
    [],
  );

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected, highlighted]);

  // The heartbeat: drift, springs and signals, only while the Network is on screen and motion is allowed.
  useEffect(() => {
    let raf = 0;
    const m = motion.current;
    const query = reducedMotion();

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      const sigma = sigmaRef.current;
      const graph = graphRef.current;
      if (!sigma || !graph) return;
      m.clock = now / 1000;
      m.frame++;

      // Springs: a dropped note eases back to where it now belongs.
      for (const [node, spring] of m.springs) {
        if (!graph.hasNode(node)) {
          m.springs.delete(node);
          continue;
        }
        const progress = (now - spring.start) / SPRING_MS;
        if (progress >= 1) {
          m.springs.delete(node);
          graph.removeNodeAttribute(node, "dragX");
          graph.removeNodeAttribute(node, "dragY");
          continue;
        }
        const attrs = graph.getNodeAttributes(node);
        const d = m.amp ? drift(attrs.seed as number, m.clock, m.amp) : { dx: 0, dy: 0 };
        const at = springBack(spring.from, { x: (attrs.x as number) + d.dx, y: (attrs.y as number) + d.dy }, progress);
        graph.mergeNodeAttributes(node, { dragX: at.x, dragY: at.y });
      }

      // Signals: finished ones flash on arrival and often fire onward, so activity cascades.
      const budget = pulseBudget(graph.size);
      const arrived: Signal[] = [];
      m.signals = m.signals.filter((signal) => (now - signal.born < signal.duration ? true : (arrived.push(signal), false)));
      for (const signal of arrived) {
        if (!graph.hasNode(signal.to)) continue;
        m.flashes.push({ node: signal.to, born: now, color: signal.color });
        if (Math.random() < 0.55 && m.signals.length < budget) fire(graph, now, signal.to);
      }
      m.flashes = m.flashes.filter((flash) => now - flash.born < FLASH_MS);
      // New signals arrive a few at a time, so the field never starts or stops in step.
      if (m.signals.length < budget && Math.random() < 0.5) fire(graph, now);

      // Drifting moves every note: refresh only the notes (links follow them on the GPU), every frame
      // on small maps and every other frame on large ones. Signals are painted every frame either way.
      if (m.amp && !m.laying && (graph.order <= 600 || m.frame % 2 === 0)) sigma.refresh({ partialGraph: { nodes: m.nodes } });
      else paint(now);
    };

    const sync = () => {
      const run = active && document.visibilityState === "visible" && !query.matches;
      m.animate = run;
      const sigma = sigmaRef.current;
      const graph = graphRef.current;
      if (sigma && graph && !m.laying) frame(sigma, graph);
      window.cancelAnimationFrame(raf);
      if (run) raf = window.requestAnimationFrame(tick);
      else {
        // At rest: signals cleared, notes back at their resting places, one still frame.
        m.signals = [];
        m.flashes = [];
        m.amp = 0;
        if (graph) for (const node of m.springs.keys()) if (graph.hasNode(node)) (graph.removeNodeAttribute(node, "dragX"), graph.removeNodeAttribute(node, "dragY"));
        m.springs.clear();
        sigma?.refresh();
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    query.addEventListener("change", sync);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
      query.removeEventListener("change", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="graph" ref={container} role="img" aria-label="Network of your notes and the links between them">
      {error && <p className="graph-error">The network could not load: {error}</p>}
    </div>
  );
});

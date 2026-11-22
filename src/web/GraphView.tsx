import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { inferSettings } from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Sigma from "sigma";
import { api, type GraphData } from "./api";

/** Community tints: each cluster of closely linked notes gets one. */
const COMMUNITY_COLORS = ["#e8f1fb", "#9fd3c7", "#f3c9a1", "#c8b9f0", "#f5e3a3", "#a8c9a3", "#f0b4c2", "#b9d4f0"];
const HIGHLIGHT = "#ffc857";
const DIM_NODE = "#36506d";
const EDGE = "rgba(143, 179, 217, 0.26)";
const EDGE_ACTIVE = "rgba(255, 200, 87, 0.75)";

export interface GraphHandle {
  /** Centres a note in the part of the map not covered by `inset` (pixels hidden on the right and at the bottom). */
  focus(id: string, inset?: { right: number; bottom: number }): void;
  relayout(): void;
}

interface Props {
  version: number;
  selected: string | null;
  highlighted: Set<string>;
  onSelect(id: string | null): void;
  onStats(stats: { nodes: number; edges: number; laying: boolean }): void;
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
    graph.addNode(id, { label: path.split("/").pop(), path, x: placed ? x : 0, y: placed ? y : 0, placed });
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
  graph.forEachNode((node) => graph.setNodeAttribute(node, "size", 2.5 + Math.sqrt(graph.degree(node)) * 1.7));
  if (graph.size > 0) {
    louvain.assign(graph, { nodeCommunityAttribute: "community" });
  }
  graph.forEachNode((node, attrs) => {
    graph.setNodeAttribute(node, "color", COMMUNITY_COLORS[(attrs.community ?? 0) % COMMUNITY_COLORS.length]);
  });
  return { graph, missing };
}

/** The whole workspace as a WebGL graph. Positions are computed once in a worker, then saved. */
export const GraphView = forwardRef<GraphHandle, Props>(function GraphView({ version, selected, highlighted, onSelect, onStats }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const state = useRef({ selected, highlighted, onSelect, onStats });
  state.current = { selected, highlighted, onSelect, onStats };
  const [error, setError] = useState<string | null>(null);

  const stopLayout = () => {
    window.clearTimeout(timerRef.current);
    layoutRef.current?.kill();
    layoutRef.current = null;
  };

  const savePositions = (graph: Graph, ids: string[]) => {
    const positions: number[] = [];
    for (const id of ids) positions.push(graph.getNodeAttribute(id, "x"), graph.getNodeAttribute(id, "y"));
    api.saveLayout(ids, positions).catch(() => undefined);
  };

  const runLayout = (graph: Graph, ids: string[]) => {
    stopLayout();
    const settings = { ...inferSettings(graph), barnesHutOptimize: graph.order > 1500, slowDown: 4 };
    const layout = new FA2Layout(graph, { settings });
    layoutRef.current = layout;
    layout.start();
    state.current.onStats({ nodes: graph.order, edges: graph.size, laying: true });
    const duration = Math.min(9000, 1500 + graph.order * 1.2);
    timerRef.current = window.setTimeout(() => {
      if (layoutRef.current !== layout) return;
      stopLayout();
      state.current.onStats({ nodes: graph.order, edges: graph.size, laying: false });
      savePositions(graph, ids);
    }, duration);
  };

  useImperativeHandle(ref, () => ({
    focus(id, inset = { right: 0, bottom: 0 }) {
      const sigma = sigmaRef.current;
      const data = sigma?.getNodeDisplayData(id);
      if (!sigma || !data) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
        sigmaRef.current?.kill();
        graphRef.current = graph;
        const sigma = new Sigma(graph, container.current, {
          settings: {
            labelRenderedSizeThreshold: 7,
            labelDensity: 0.6,
            hideEdgesOnMove: graph.size > 20000,
            antialiasEdges: graph.size < 20000,
            minCameraRatio: 0.03,
            maxCameraRatio: 8,
          },
          nodeReducer: (node, display, _attrs, nodeState) => {
            const { selected, highlighted } = state.current;
            const focusSet = selected ? new Set([selected, ...graph.neighbors(selected)]) : null;
            const result: Partial<typeof display> = { labelColor: "#dbe8f6" };
            if (highlighted.size) {
              if (highlighted.has(node)) Object.assign(result, { color: HIGHLIGHT, labelVisibility: "visible", zIndex: 2 });
              else Object.assign(result, { color: DIM_NODE, label: null });
            } else if (focusSet) {
              if (node === selected) Object.assign(result, { color: HIGHLIGHT, labelVisibility: "visible", zIndex: 2 });
              else if (focusSet.has(node)) Object.assign(result, { labelVisibility: "visible", zIndex: 1 });
              else Object.assign(result, { color: DIM_NODE, label: null });
            }
            if (nodeState.isHovered) result.labelVisibility = "visible";
            return result;
          },
          edgeReducer: (edge, _display) => {
            const { selected } = state.current;
            if (selected && graph.hasExtremity(edge, selected)) return { color: EDGE_ACTIVE, size: 1.4 };
            return { color: EDGE, size: 0.6 };
          },
        });
        sigma.on("clickNode", ({ node }) => state.current.onSelect(node));
        sigma.on("clickStage", () => state.current.onSelect(null));
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
  }, [version]);

  useEffect(() => () => {
    stopLayout();
    sigmaRef.current?.kill();
  }, []);

  useEffect(() => {
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected, highlighted]);

  return (
    <div className="graph" ref={container} role="img" aria-label="Map of your notes and the links between them">
      {error && <p className="graph-error">The map could not load: {error}</p>}
    </div>
  );
});

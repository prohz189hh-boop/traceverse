import type { ServiceGraph, ServiceNode } from '@traceverse/core';
import { stableHash } from './observations.js';
type Position = [number, number, number];

/** Persistent category bands keep existing services still as topology grows. */
export function createLayoutRegistry() {
  const positions = new Map<string, Position>();
  return {
    layout(graph: ServiceGraph): ServiceGraph {
      const occupied = graph.nodes
        .map((node) => positions.get(`${node.category}:${node.id}`))
        .filter((p): p is Position => !!p);
      for (const node of [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
        const key = `${node.category}:${node.id}`;
        if (positions.has(key)) continue;
        const seed = stableHash(key);
        let candidate: Position = [0, 0, 0];
        for (let attempt = 0; attempt < 200; attempt++) {
          const a = stableHash(`${seed}:${attempt}`) / 4294967296;
          const b = stableHash(`${attempt}:${seed}`) / 4294967296;
          const expansion = 1 + Math.max(0, attempt - 24) / 35;
          const z = (b - 0.5) * (node.category === 'service' ? 10 : 5) * expansion;
          const x =
            node.category === 'frontend'
              ? -7.4 + a * 1.5
              : node.category === 'database'
                ? 6.6 + a * 1.6
                : node.category === 'external'
                  ? 7.2 + a * 2
                  : (a - 0.5) * 8 * expansion;
          candidate = [
            x,
            (((seed >>> 12) % 7) - 3) * 0.28,
            z + (node.category === 'external' ? -4 : node.category === 'database' ? 3 : 0),
          ];
          if (occupied.every((p) => Math.hypot(p[0] - candidate[0], p[2] - candidate[2]) >= 3.15))
            break;
        }
        positions.set(key, candidate);
        occupied.push(candidate);
      }
      if (positions.size > 2000) {
        const current = new Set(graph.nodes.map((node) => `${node.category}:${node.id}`));
        for (const key of positions.keys()) if (!current.has(key)) positions.delete(key);
      }
      return {
        nodes: graph.nodes.map((node) => ({
          ...node,
          position: positions.get(`${node.category}:${node.id}`)!,
        })),
        edges: graph.edges,
      };
    },
  };
}
const sharedLayout = createLayoutRegistry();
/** Both renderers share coordinates, including when switching views. */
export function layoutGraph(graph: ServiceGraph): ServiceGraph {
  return sharedLayout.layout(graph);
}
export function boundedGraph(graph: ServiceGraph, selected: string | null): ServiceGraph {
  const chosen = [...graph.nodes]
    .sort(
      (a, b) =>
        Number(b.id === selected) - Number(a.id === selected) ||
        b.lastSeen - a.lastSeen ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 40);
  const ids = new Set(chosen.map((node) => node.id));
  return {
    nodes: chosen.sort((a, b) => a.id.localeCompare(b.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).slice(0, 300),
  };
}
export function graphBounds(nodes: ServiceNode[]) {
  if (!nodes.length) return { center: [0, 0, 0] as Position, radius: 7 };
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, node.position[axis]!);
      max[axis] = Math.max(max[axis]!, node.position[axis]!);
    }
  const center = min.map((value, axis) => (value + max[axis]!) / 2) as Position;
  return {
    center,
    radius:
      Math.max(
        3.4,
        ...nodes.map((node) =>
          Math.hypot(...node.position.map((value, axis) => value - center[axis]!)),
        ),
      ) + 1.6,
  };
}

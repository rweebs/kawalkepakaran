// 3D layout for the /pantau relationship graph (src/components/RelasiGraph3D.tsx). Pure and deterministic.
//
// Unlike the 2D graph, Rahmat Wibowo is not pinned at the centre: he is one node among the others and sits wherever
// his links put him. Every link is a spring; links to him are deliberately weak (he is linked to nearly everything,
// so full-strength springs would drag the whole graph into a star around him), and the links between the other
// entities (a report and its terlapor, a terlapor and the site pages that name them, an account and its threads,
// a group and its members) decide the shape. Layout only: it adds no claim the 2D graph does not already make.
import type { GEdge, GNode } from './relasi';

export const CENTER_ID = 'rw';

export interface Link3 { a: number; b: number; kind: GEdge['kind'] | 'member'; weight: number }
export interface Layout3 { positions: Float32Array; links: Link3[]; index: Map<string, number>; radius: number }

export interface LayoutOptions { iterations?: number; /** spring strength of links that touch the Pelapor, 0..1 */ pelaporPull?: number; seed?: number }

/** Small seeded PRNG (mulberry32) so the same data always lays out the same way. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One link per node pair: parent -> member links first, then every edge. A real edge replaces a bare membership link. */
export function buildLinks(nodes: readonly GNode[], edges: readonly GEdge[]): { links: Link3[]; index: Map<string, number> } {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const byPair = new Map<string, Link3>();
  const put = (from: string, to: string, kind: Link3['kind'], weight: number) => {
    const a = index.get(from);
    const b = index.get(to);
    if (a === undefined || b === undefined || a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const old = byPair.get(key);
    if (!old || old.kind === 'member') byPair.set(key, { a, b, kind, weight });
    else if (weight > old.weight) byPair.set(key, { a, b, kind, weight });
  };
  for (const n of nodes) if (n.parent) put(n.parent, n.id, 'member', 1);
  for (const e of edges) put(e.from, e.to, e.kind, e.weight);
  return { links: [...byPair.values()], index };
}

export function layout3d(nodes: readonly GNode[], edges: readonly GEdge[], opts: LayoutOptions = {}): Layout3 {
  const n = nodes.length;
  const { links, index } = buildLinks(nodes, edges);
  const positions = new Float32Array(n * 3);
  if (n === 0) return { positions, links, index, radius: 1 };
  const iterations = opts.iterations ?? 260;
  const pelaporPull = opts.pelaporPull ?? 0.001;
  const rw = index.get(CENTER_ID) ?? -1;
  const rand = rng(opts.seed ?? 7);

  // Start on a jittered sphere so no two nodes begin at the same point.
  const R0 = Math.cbrt(n) * 4;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const phi = i * 2.399963;
    positions[i * 3] = Math.cos(phi) * rr * R0 + (rand() - 0.5);
    positions[i * 3 + 1] = y * R0 + (rand() - 0.5);
    positions[i * 3 + 2] = Math.sin(phi) * rr * R0 + (rand() - 0.5);
  }

  const REST = 5;
  const K = 7; // repulsion scale
  const disp = new Float32Array(n * 3);
  const strength = links.map((l) => (l.a === rw || l.b === rw ? pelaporPull : l.kind === 'member' ? 1 : 0.8));
  for (let it = 0; it < iterations; it++) {
    disp.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = positions[i * 3] - positions[j * 3];
        let dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        let dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.01) { dx = rand() - 0.5; dy = rand() - 0.5; dz = rand() - 0.5; d2 = 0.01; }
        const f = (K * K) / d2; // force divided by distance, so it scales the offset vector
        disp[i * 3] += dx * f; disp[i * 3 + 1] += dy * f; disp[i * 3 + 2] += dz * f;
        disp[j * 3] -= dx * f; disp[j * 3 + 1] -= dy * f; disp[j * 3 + 2] -= dz * f;
      }
    }
    links.forEach((l, k) => {
      const dx = positions[l.a * 3] - positions[l.b * 3];
      const dy = positions[l.a * 3 + 1] - positions[l.b * 3 + 1];
      const dz = positions[l.a * 3 + 2] - positions[l.b * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 0.01;
      const f = (strength[k] * (d - REST)) / d;
      disp[l.a * 3] -= dx * f; disp[l.a * 3 + 1] -= dy * f; disp[l.a * 3 + 2] -= dz * f;
      disp[l.b * 3] += dx * f; disp[l.b * 3 + 1] += dy * f; disp[l.b * 3 + 2] += dz * f;
    });
    // Light gravity toward the origin keeps disconnected pieces together. It treats every node alike, Rahmat included.
    const step = 1.6 * (1 - it / iterations) + 0.05;
    for (let i = 0; i < n; i++) {
      const dx = disp[i * 3] - positions[i * 3] * 0.012;
      const dy = disp[i * 3 + 1] - positions[i * 3 + 1] * 0.012;
      const dz = disp[i * 3 + 2] - positions[i * 3 + 2] * 0.012;
      const m = Math.hypot(dx, dy, dz) || 1;
      const cap = Math.min(m, step);
      positions[i * 3] += (dx / m) * cap;
      positions[i * 3 + 1] += (dy / m) * cap;
      positions[i * 3 + 2] += (dz / m) * cap;
    }
  }

  // Centre on the centroid of all nodes (not on Rahmat), then measure the extent.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  let radius = 1;
  for (let i = 0; i < n; i++) {
    positions[i * 3] -= cx; positions[i * 3 + 1] -= cy; positions[i * 3 + 2] -= cz;
    radius = Math.max(radius, Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]));
  }
  return { positions, links, index, radius };
}

const dist = (l: Layout3, k: number) => Math.hypot(l.positions[k * 3], l.positions[k * 3 + 1], l.positions[k * 3 + 2]);

/** Distance of node `id` from the centroid of the layout, as a fraction of the layout radius (0 = dead centre). */
export function offCentre(l: Layout3, id: string): number {
  const i = l.index.get(id);
  return i === undefined ? 0 : dist(l, i) / l.radius;
}

/** How many nodes sit closer to the centroid than node `id` (0 = it is the closest node). */
export function centreRank(l: Layout3, id: string): number {
  const i = l.index.get(id);
  if (i === undefined) return -1;
  const mine = dist(l, i);
  let rank = 0;
  for (let k = 0; k < l.positions.length / 3; k++) if (dist(l, k) < mine) rank++;
  return rank;
}

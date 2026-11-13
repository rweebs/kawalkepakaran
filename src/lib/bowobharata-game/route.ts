// A nav grid over the play disc and A* routes on it, string-pulled. Routes keep `clear` m from every collider,
// so the chariot (hull radius 1.45 m) can follow them. Pure and deterministic: ties break by insertion order.
import { dist, type XZ } from './geom';
import { PLAY, clearance, type Collider } from './world';

export interface NavGrid {
  cell: number;
  minX: number;
  minZ: number;
  n: number;
  free: Uint8Array;
  clear: number;
}

const FREE_R = 146;
const SNAP_R = 12;
const SAMPLE = 1;

export function buildNav(cols: readonly Collider[], cell = 4, clear = 2.45): NavGrid {
  const minX = PLAY.cx - PLAY.r;
  const minZ = PLAY.cz - PLAY.r;
  const n = Math.ceil((PLAY.r * 2) / cell);
  const free = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = { x: minX + (i + 0.5) * cell, z: minZ + (j + 0.5) * cell };
      if (Math.hypot(p.x - PLAY.cx, p.z - PLAY.cz) <= FREE_R && clearance(p, cols) >= clear) free[j * n + i] = 1;
    }
  }
  return { cell, minX, minZ, n, free, clear };
}

function centre(nav: NavGrid, idx: number): XZ {
  return { x: nav.minX + ((idx % nav.n) + 0.5) * nav.cell, z: nav.minZ + (Math.floor(idx / nav.n) + 0.5) * nav.cell };
}

/** The nearest free cell centre within SNAP_R of p, or -1. Ties go to the lower index. */
function snap(nav: NavGrid, p: XZ): number {
  const ci = Math.floor((p.x - nav.minX) / nav.cell);
  const cj = Math.floor((p.z - nav.minZ) / nav.cell);
  const span = Math.ceil(SNAP_R / nav.cell) + 1;
  let best = -1;
  let bestD = SNAP_R + 1e-9;
  for (let j = Math.max(0, cj - span); j <= Math.min(nav.n - 1, cj + span); j++) {
    for (let i = Math.max(0, ci - span); i <= Math.min(nav.n - 1, ci + span); i++) {
      const idx = j * nav.n + i;
      if (!nav.free[idx]) continue;
      const d = dist(p, centre(nav, idx));
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
  }
  return best;
}

/** True when every sample (every SAMPLE m, ends included) along a→b keeps clearance ≥ clear; samples within `exempt.r` of `exempt.at` are skipped. */
function segmentClear(a: XZ, b: XZ, cols: readonly Collider[], clear: number, exempt?: { at: XZ; r: number }[]): boolean {
  const len = dist(a, b);
  const steps = Math.max(1, Math.ceil(len / SAMPLE));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    if (exempt?.some((e) => dist(p, e.at) <= e.r)) continue;
    if (clearance(p, cols) < clear) return false;
  }
  return true;
}

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Binary min-heap on (f, seq): equal f pops in insertion order. */
class Heap {
  private f: number[] = [];
  private s: number[] = [];
  private v: number[] = [];
  private seq = 0;
  get size(): number {
    return this.v.length;
  }
  private less(a: number, b: number): boolean {
    return this.f[a] < this.f[b] || (this.f[a] === this.f[b] && this.s[a] < this.s[b]);
  }
  private swap(a: number, b: number): void {
    [this.f[a], this.f[b]] = [this.f[b], this.f[a]];
    [this.s[a], this.s[b]] = [this.s[b], this.s[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
  push(f: number, v: number): void {
    this.f.push(f);
    this.s.push(this.seq++);
    this.v.push(v);
    let k = this.v.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!this.less(k, p)) break;
      this.swap(k, p);
      k = p;
    }
  }
  pop(): number {
    const top = this.v[0];
    const last = this.v.length - 1;
    this.swap(0, last);
    this.f.pop();
    this.s.pop();
    this.v.pop();
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < last && this.less(l, m)) m = l;
      if (r < last && this.less(r, m)) m = r;
      if (m === k) break;
      this.swap(k, m);
      k = m;
    }
    return top;
  }
}

export function routeTo(nav: NavGrid, cols: readonly Collider[], from: XZ, to: XZ): XZ[] | null {
  const start = snap(nav, from);
  const goal = snap(nav, to);
  if (start < 0 || goal < 0) return null;
  const { n, cell, clear } = nav;
  const gc = centre(nav, goal);
  const h = (idx: number): number => {
    const dx = Math.abs(centre(nav, idx).x - gc.x);
    const dz = Math.abs(centre(nav, idx).z - gc.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const g = new Float64Array(n * n).fill(Infinity);
  const parent = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const heap = new Heap();
  g[start] = 0;
  heap.push(h(start), start);
  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const ci = cur % n;
    const cj = (cur - ci) / n;
    const cp = centre(nav, cur);
    for (const [di, dj, w] of NEIGHBOURS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const nb = j * n + i;
      if (!nav.free[nb] || closed[nb]) continue;
      const ng = g[cur] + w * cell;
      if (ng >= g[nb]) continue;
      if (!segmentClear(cp, centre(nav, nb), cols, clear)) continue;
      g[nb] = ng;
      parent[nb] = cur;
      heap.push(ng + h(nb), nb);
    }
  }
  if (!found) return null;
  const cells: XZ[] = [];
  for (let k = goal; k >= 0; k = parent[k]) cells.push(centre(nav, k));
  cells.reverse();
  const pts: XZ[] = [{ x: from.x, z: from.z }, ...cells, { x: to.x, z: to.z }];
  // String-pull: the first and last legs may start inside the snap radius of a point that is itself tight.
  const last = pts.length - 1;
  const out: XZ[] = [pts[0]];
  let a = 0;
  while (a < last) {
    let b = a + 1;
    for (let k = last; k > a + 1; k--) {
      const exempt = [...(a === 0 ? [{ at: pts[0], r: SNAP_R }] : []), ...(k === last ? [{ at: pts[last], r: SNAP_R }] : [])];
      if (segmentClear(pts[a], pts[k], cols, clear, exempt)) {
        b = k;
        break;
      }
    }
    out.push(pts[b]);
    a = b;
  }
  return out;
}

export function pathLength(p: readonly XZ[]): number {
  let s = 0;
  for (let k = 1; k < p.length; k++) s += dist(p[k - 1], p[k]);
  return s;
}

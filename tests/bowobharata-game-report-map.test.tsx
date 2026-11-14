import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import * as THREE from 'three';
import type { MapGraph, MapNode } from '../src/lib/bowobharata-game/report-types';
import {
  BG_HEX, DIM_HEX, DIM_SCALE, HALO_SCALE, LINK_HEX, MAX_DOT, MIN_DOT, NODE_HEX, STILL_PAD, SVG_H, SVG_W, WALK_MS, brightFor, degrees, entryFor, neighbours, project2d, radiusFor, railChips,
  sceneInput, shownUpTo, stillOpacity, stillPicture, walkNext, walkStart,
} from '../src/lib/bowobharata-game/report-map-view';
import {
  DIM_SIZE, EASE_MS, FIT_MARGIN, FIT_MS, HALO_GLOW, HALO_SIZE, LINK_COLORS, MIN_NODE_PX, buildReportObjects, createReportMap, dimLinkOpacity, fitView,
  linkOpacity, litLinkOpacity, sceneSettings, type ReportMapApi,
} from '../src/lib/bowobharata-game/world/report-map';
import { ReportMap, namedGraph, type MapLabels } from '../src/components/bowobharata-game/ReportMap';
import { gameData } from '../src/lib/bowobharata-game/data-build';

// The record map (Task 3 of the chapter reports): the pure view, the three.js scene built in node without a renderer, the
// scene's lifecycle against a stub renderer, the still SVG through renderToString, and source checks on the 3D module.

/** The 3D module runs here against a stub renderer: node has no WebGL. Everything else in three stays real. */
const stub = vi.hoisted(() => {
  class StubRenderer {
    calls: string[] = [];
    pixelRatio = 0;
    renders = 0;
    camera: { position: { x: number; y: number; z: number }; getWorldDirection(v: unknown): unknown } | null = null;
    size: [number, number] = [0, 0];
    clear: [number, number] = [-1, -1];
    constructor(public params: { canvas: unknown; antialias?: boolean }) {
      made.push(this);
    }
    setPixelRatio(r: number) { this.pixelRatio = r; }
    setClearColor(c: number, a: number) { this.clear = [c, a]; }
    setSize(w: number, h: number) { this.size = [w, h]; }
    render(_scene: unknown, camera: StubRenderer['camera']) {
      this.renders++;
      this.camera = camera;
    }
    dispose() { this.calls.push('dispose'); }
    forceContextLoss() { this.calls.push('forceContextLoss'); }
  }
  const made: StubRenderer[] = [];
  return { StubRenderer, made };
});
vi.mock('three', async (importOriginal) => ({ ...(await importOriginal<typeof import('three')>()), WebGLRenderer: stub.StubRenderer }));

const read = (f: string) => readFileSync(f, 'utf8');

// The fixture: the Pelapor, the perkara hub, category A with T-1 (chapter 0) and T-2 (chapter 2), the laporan hub, the
// group of reports by the Pelapor, and LP-01, a report linked to T-2 (chapter 2). Links as layout3d builds them: one per
// pair, `a` the edge's source.
const node = (id: string, kind: MapNode['kind'], source: MapNode['source'], label: string, chapter: number): MapNode => ({ id, kind, source, label, chapter });
const G: MapGraph = {
  nodes: [
    node('rw', 'center', 'rw', 'Pusat Satu', 0),
    node('perkara', 'hub', 'perkara', 'Terlapor', 0),
    node('pk:A', 'cluster', 'perkara', 'Kategori A', 0),
    node('tl:T-1', 'member', 'perkara', 'Nama Satu', 0),
    node('tl:T-2', 'member', 'perkara', 'Nama Dua', 2),
    node('laporan', 'hub', 'laporan', 'Laporan polisi', 0),
    node('lp:out', 'cluster', 'laporan', 'oleh Pelapor', 0),
    node('lp:LP-01', 'member', 'laporan', 'LP-01', 2),
  ],
  links: [
    { a: 1, b: 2, kind: 'member', chapter: 0 },
    { a: 2, b: 3, kind: 'member', chapter: 0 },
    { a: 2, b: 4, kind: 'member', chapter: 2 },
    { a: 3, b: 0, kind: 'in-allegation', chapter: 0 },
    { a: 0, b: 4, kind: 'out-response', chapter: 2 },
    { a: 5, b: 6, kind: 'member', chapter: 0 },
    { a: 6, b: 7, kind: 'member', chapter: 2 },
    { a: 0, b: 7, kind: 'out-response', chapter: 2 },
    { a: 7, b: 4, kind: 'out-response', chapter: 2 },
  ],
  pos: [0, 0, 0, -8, 2, 1, -5, 4, -2, -3, 7, 3, 2, 5, -4, 8, -3, 2, 6, -6, -1, 4, -2, -6],
  radius: 8.77,
};
const [RW, PERKARA, PK_A, T1, T2, LAPORAN, LP_OUT, LP01] = [0, 1, 2, 3, 4, 5, 6, 7];
/** Prologue, eight parvas and the finale: T-1 has its entry in the prologue, T-2 in parva 2. */
const CHAPTERS: string[][] = [['T-1'], [], ['T-2'], [], [], [], [], [], [], []];
const ALL = G.nodes.map(() => true);
const LABEL_LIST = G.nodes.map((n) => n.label);

const LABELS: MapLabels = {
  title: 'Peta catatan',
  hint: 'Seret untuk memutar',
  still: 'Peta 3D tidak terbuka',
  aria: 'Peta hubungan catatan sampai bab ini',
  sources: { rw: 'Warna pusat', perkara: 'Warna perkara', laporan: 'Warna laporan' },
  links: { 'in-allegation': 'Jenis dugaan', 'out-response': 'Jenis tanggapan', against: 'Jenis terhadap', member: 'Jenis anggota' },
  bright: 'Terang', dim: 'Redup', size: 'Ukuran titik', selected: 'Titik terpilih', linksTitle: 'Hubungan', clear: 'Hapus pilihan', entry: 'Lihat entri',
  kinds: { center: 'pusat', hub: 'sumber', cluster: 'kelompok', member: 'butir' },
  rail: { label: 'Rel parva', all: 'Semua', prologue: 'Prolog', finale: 'Akhir', chapter: ({ n }) => `Parva ${n}`, walk: 'Jalan', pause: 'Jeda' },
};

const hexNum = (h: string) => parseInt(h.slice(1), 16);
/** Each chapter's terlapor ids on a graph, from the nodes' own chapters. */
const chapterIdsOf = (g: MapGraph): string[][] =>
  Array.from({ length: 10 }, (_, c) => g.nodes.filter((n) => n.id.startsWith('tl:') && n.chapter === c).map((n) => n.id.slice(3)));
type Disposable = { addEventListener(type: 'dispose', listener: () => void): void };
const sameSet = (a: Iterable<number>, b: Iterable<number>) => expect([...a].sort((x, y) => x - y)).toEqual([...b].sort((x, y) => x - y));

describe('report-map-view: colours and sizes', () => {
  it('keeps the /pantau colours: three sources, four link kinds, the dim fill and the background', () => {
    expect(NODE_HEX).toEqual({ rw: '#e3b341', perkara: '#9085e9', laporan: '#c3c2b7' });
    expect(LINK_HEX).toEqual({ 'in-allegation': '#f0a27c', 'out-response': '#3987e5', against: '#c9d1dc', member: '#475569' });
    expect(DIM_HEX).toBe('#1f2a44');
    expect(BG_HEX).toBe('#0b1020');
  });

  it('degrees counts every link at both ends', () => {
    expect(degrees(G)).toEqual([3, 1, 3, 2, 3, 1, 2, 3]);
    expect(degrees(G).reduce((s, d) => s + d, 0)).toBe(2 * G.links.length);
  });

  it('radiusFor grows with the square root of the degree and caps at 4.5', () => {
    expect(radiusFor(0)).toBe(0.35);
    expect(radiusFor(100)).toBeCloseTo(3.35, 10);
    expect(radiusFor(10_000)).toBe(4.5);
    expect(radiusFor(4)).toBeCloseTo(0.95, 10);
  });
});

describe('report-map-view: what shows and what is bright', () => {
  it('shownUpTo(g, 1) hides T-2 and LP-01, which first appear in chapter 2', () => {
    expect(shownUpTo(G, 1)).toEqual([true, true, true, true, false, true, true, false]);
    expect(shownUpTo(G, 2)).toEqual(ALL);
    expect(shownUpTo(G, 9)).toEqual(ALL);
  });

  it('with focus 2, brightFor brightens the center, T-2, pk:A and LP-01, but not T-1 or the hubs and groups', () => {
    const bright = brightFor(G, CHAPTERS, 2, shownUpTo(G, 2));
    sameSet(bright.flatMap((b, i) => (b ? [i] : [])), [RW, PK_A, T2, LP01]);
    expect(bright[T1]).toBe(false);
    for (const i of [PERKARA, LAPORAN, LP_OUT]) expect(bright[i]).toBe(false);
  });

  it('with focus 0, the prologue: the center, T-1 and its category, and no report (LP-01 links only T-2)', () => {
    const bright = brightFor(G, CHAPTERS, 0, shownUpTo(G, 0));
    sameSet(bright.flatMap((b, i) => (b ? [i] : [])), [RW, PK_A, T1]);
  });

  it('with focus null, brightFor equals shown', () => {
    for (const upTo of [0, 1, 2, 9]) {
      const shown = shownUpTo(G, upTo);
      expect(brightFor(G, CHAPTERS, null, shown)).toEqual(shown);
    }
  });

  it('a bright node must be shown: focus 2 over the record up to chapter 1 leaves T-2 and LP-01 out, and keeps pk:A, which is shown', () => {
    const bright = brightFor(G, CHAPTERS, 2, shownUpTo(G, 1));
    sameSet(bright.flatMap((b, i) => (b ? [i] : [])), [RW, PK_A]);
  });

  it('a chapter with no names brightens the center alone, and an id with no node is ignored', () => {
    sameSet(brightFor(G, CHAPTERS, 6, ALL).flatMap((b, i) => (b ? [i] : [])), [RW]);
    sameSet(brightFor(G, [['T-404']], 0, ALL).flatMap((b, i) => (b ? [i] : [])), [RW]);
    sameSet(brightFor(G, CHAPTERS, 42, ALL).flatMap((b, i) => (b ? [i] : [])), [RW]);
  });
});

describe('report-map-view: the still projection', () => {
  it('project2d fits every node inside the box less pad, fills one side of it, keeps the aspect ratio, and rounds to 0.1', () => {
    for (const [w, h, pad] of [[640, 400, 16], [300, 500, 10]] as const) {
      const p = project2d(G, w, h, { pad });
      expect(p).toHaveLength(G.nodes.length);
      for (const q of p) {
        expect(q.x).toBeGreaterThanOrEqual(pad);
        expect(q.x).toBeLessThanOrEqual(w - pad);
        expect(q.y).toBeGreaterThanOrEqual(pad);
        expect(q.y).toBeLessThanOrEqual(h - pad);
        for (const v of [q.x, q.y, q.depth]) expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
      }
      const xs = p.map((q) => q.x);
      const ys = p.map((q) => q.y);
      const fillsX = Math.abs(Math.min(...xs) - pad) < 0.11 && Math.abs(Math.max(...xs) - (w - pad)) < 0.11;
      const fillsY = Math.abs(Math.min(...ys) - pad) < 0.11 && Math.abs(Math.max(...ys) - (h - pad)) < 0.11;
      expect(fillsX || fillsY).toBe(true);
    }
    // One scale for both axes: two nodes on the x axis and two on the y axis keep their 2 : 1 spread.
    const cross: MapGraph = { nodes: G.nodes.slice(0, 4), links: [], pos: [-2, 0, 0, 2, 0, 0, 0, -1, 0, 0, 1, 0], radius: 2 };
    const c = project2d(cross, 640, 400, { yaw: 0, pitch: 0, pad: 20 });
    expect(c[1].x - c[0].x).toBeCloseTo(2 * (c[2].y - c[3].y), 5);
    expect(c[1].x - c[0].x).toBeCloseTo(600, 5);
  });

  it('project2d with `only` fits just those nodes into the box', () => {
    const shown = shownUpTo(G, 1);
    const p = project2d(G, 640, 400, { only: shown });
    const xs = p.filter((_, i) => shown[i]).map((q) => q.x);
    const ys = p.filter((_, i) => shown[i]).map((q) => q.y);
    for (const v of xs) expect(v).toBeGreaterThanOrEqual(16), expect(v).toBeLessThanOrEqual(624);
    for (const v of ys) expect(v).toBeGreaterThanOrEqual(16), expect(v).toBeLessThanOrEqual(384);
    const fills = (Math.min(...xs) === 16 && Math.max(...xs) === 624) || (Math.min(...ys) === 16 && Math.max(...ys) === 384);
    expect(fills).toBe(true);
    expect(project2d(G, 640, 400, { only: ALL })).toEqual(project2d(G, 640, 400));
    expect(project2d(G, 640, 400, { only: ALL.map(() => false) })).toEqual(project2d(G, 640, 400));
  });

  it('project2d is deterministic', () => {
    expect(project2d(G, 640, 400)).toEqual(project2d(G, 640, 400));
    expect(JSON.stringify(project2d(G, 640, 400, { yaw: 1.2, pitch: -0.2, pad: 8 }))).toBe(JSON.stringify(project2d(G, 640, 400, { yaw: 1.2, pitch: -0.2, pad: 8 })));
  });

  it('yaw and pitch place the viewer like the 3D camera at its start: depth grows toward the viewer, y grows down', () => {
    const two: MapGraph = { nodes: G.nodes.slice(0, 2), links: [], pos: [1, 0, 0, -1, 0, 0], radius: 1 };
    // Yaw 0: the viewer looks down −z; x keeps its side.
    const flat = project2d(two, 640, 400, { yaw: 0, pitch: 0 });
    expect(flat[0].x).toBeGreaterThan(flat[1].x);
    // Yaw π/2: the viewer stands on +x, so the node at +x is nearest.
    const side = project2d(two, 640, 400, { yaw: Math.PI / 2, pitch: 0 });
    expect(side[0].depth).toBeGreaterThan(side[1].depth);
    // Pitch up: the viewer is above, so the node at +y sits nearer; +y is up on screen.
    const up: MapGraph = { nodes: G.nodes.slice(0, 2), links: [], pos: [0, 1, 0, 0, -1, 0], radius: 1 };
    const above = project2d(up, 640, 400, { yaw: 0, pitch: 0.5 });
    expect(above[0].depth).toBeGreaterThan(above[1].depth);
    expect(above[0].y).toBeLessThan(above[1].y);
    // The default view looks from beside the 3D camera's opening position, (0.8, 0.25, 1.05) × radius: a node there is
    // nearer than nodes behind the origin or off to the other side.
    const cam: MapGraph = { nodes: G.nodes.slice(0, 3), links: [], pos: [0.8, 0.25, 1.05, -1, -1, -1, 1, 1, -1], radius: 2 };
    const v = project2d(cam, 640, 400);
    expect(v[0].depth).toBeGreaterThan(Math.max(v[1].depth, v[2].depth));
  });

  it('a single node, or nodes on one spot, sit in the middle of the box with no NaN', () => {
    const one: MapGraph = { nodes: G.nodes.slice(0, 1), links: [], pos: [3, 4, 5], radius: 1 };
    expect(project2d(one, 640, 400)).toEqual([{ x: 320, y: 200, depth: expect.any(Number) }]);
    const stack: MapGraph = { nodes: G.nodes.slice(0, 3), links: [], pos: [1, 1, 1, 1, 1, 1, 1, 1, 1], radius: 1 };
    for (const q of project2d(stack, 640, 400)) expect([q.x, q.y]).toEqual([320, 200]);
    const line: MapGraph = { nodes: G.nodes.slice(0, 2), links: [], pos: [0, -1, 0, 0, 1, 0], radius: 1 };
    const l = project2d(line, 640, 400, { yaw: 0, pitch: 0 });
    expect(l.map((q) => q.x)).toEqual([320, 320]);
    expect(l.map((q) => q.y).sort((a, b) => a - b)).toEqual([16, 384]);
    expect(project2d({ nodes: [], links: [], pos: [], radius: 1 }, 640, 400)).toEqual([]);
  });
});

describe('report-map-view: neighbours', () => {
  it('lists the shown links of a node, out when the node is the link’s a', () => {
    expect(neighbours(G, RW, ALL)).toEqual([
      { other: LP01, kind: 'out-response', dir: 'out' },
      { other: T2, kind: 'out-response', dir: 'out' },
      { other: T1, kind: 'in-allegation', dir: 'in' },
    ]);
    expect(neighbours(G, RW, shownUpTo(G, 1))).toEqual([{ other: T1, kind: 'in-allegation', dir: 'in' }]);
    expect(neighbours(G, T2, shownUpTo(G, 1))).toEqual([]);
  });

  it('puts non-member links first, then member links, each by the other node’s label in code-point order', () => {
    expect(neighbours(G, T2, ALL)).toEqual([
      { other: LP01, kind: 'out-response', dir: 'in' },
      { other: RW, kind: 'out-response', dir: 'in' },
      { other: PK_A, kind: 'member', dir: 'in' },
    ]);
    // Code points, not the locale: 'Bayu' (B = 66) sorts before 'apel' (a = 97), and 'Zed' before 'Ä'.
    const star: MapGraph = {
      nodes: [node('rw', 'center', 'rw', 'x', 0), node('a', 'member', 'perkara', 'apel', 0), node('b', 'member', 'perkara', 'Bayu', 0),
        node('c', 'member', 'perkara', 'Ä', 0), node('d', 'member', 'perkara', 'Zed', 0), node('e', 'cluster', 'perkara', 'Aaa', 0)],
      links: [{ a: 0, b: 1, kind: 'in-allegation', chapter: 0 }, { a: 0, b: 2, kind: 'in-allegation', chapter: 0 }, { a: 0, b: 3, kind: 'against', chapter: 0 },
        { a: 0, b: 4, kind: 'out-response', chapter: 0 }, { a: 5, b: 0, kind: 'member', chapter: 0 }],
      pos: new Array(18).fill(0),
      radius: 1,
    };
    expect(neighbours(star, 0, star.nodes.map(() => true)).map((n) => star.nodes[n.other].label)).toEqual(['Bayu', 'Zed', 'apel', 'Ä', 'Aaa']);
  });
});

describe('report-map-view: the still picture', () => {
  it('draws only shown links, in LINK_HEX, at 0.08 touching the center, 0.35 for members, 0.7 for the rest, at most 0.12 when an end is dim, and stronger between bright nodes under a focus', () => {
    expect(stillOpacity('out-response', true, 'base')).toBe(0.08);
    expect(stillOpacity('member', false, 'base')).toBe(0.35);
    expect(stillOpacity('against', false, 'base')).toBe(0.7);
    expect(stillOpacity('in-allegation', false, 'dim')).toBe(0.12);
    expect(stillOpacity('member', false, 'dim')).toBe(0.12);
    expect(stillOpacity('in-allegation', true, 'dim')).toBe(0.08);
    for (const [k, c] of [['member', false], ['against', false], ['out-response', true]] as const) {
      expect(stillOpacity(k, c, 'lit'), k).toBeGreaterThan(stillOpacity(k, c, 'base'));
    }

    const all = stillPicture(G, ALL, ALL);
    expect(all.lines).toHaveLength(G.links.length);
    const p = project2d(G, SVG_W, SVG_H, { pad: STILL_PAD, only: ALL });
    G.links.forEach((l, j) => {
      const line = all.lines[j];
      expect([line.x1, line.y1, line.x2, line.y2]).toEqual([p[l.a].x, p[l.a].y, p[l.b].x, p[l.b].y]);
      expect(line.color).toBe(LINK_HEX[l.kind]);
      expect(line.opacity).toBe(stillOpacity(l.kind, l.a === RW || l.b === RW, 'base'));
    });
    const early = stillPicture(G, shownUpTo(G, 1), brightFor(G, CHAPTERS, null, shownUpTo(G, 1)));
    expect(early.lines.map((l) => l.key)).toEqual(['1-2', '2-3', '3-0', '5-6']);
    const shown = shownUpTo(G, 2);
    const focused = stillPicture(G, shown, brightFor(G, CHAPTERS, 2, shown));
    const op = new Map(focused.lines.map((l) => [l.key, l.opacity]));
    expect(op.get('2-4')).toBe(stillOpacity('member', false, 'lit')); // pk:A – T-2, both bright
    expect(op.get('2-3')).toBe(0.12); // pk:A – T-1, T-1 dim
    expect(op.get('7-4')).toBe(stillOpacity('out-response', false, 'lit')); // LP-01 – T-2
    expect(op.get('0-4')).toBe(stillOpacity('out-response', true, 'lit')); // the center – T-2
    expect(op.get('3-0')).toBe(0.08); // T-1 – the center, T-1 dim: never brighter than its own 0.08
  });

  it('frames the shown nodes: they fill the box less the halo margin, whatever chapter it is', () => {
    expect(STILL_PAD).toBeGreaterThanOrEqual(MAX_DOT * HALO_SCALE);
    for (const upTo of [0, 1, 2]) {
      const shown = shownUpTo(G, upTo);
      const pic = stillPicture(G, shown, shown);
      const xs = pic.dots.map((d) => d.cx);
      const ys = pic.dots.map((d) => d.cy);
      for (const d of pic.dots) {
        expect(d.cx - d.r * HALO_SCALE).toBeGreaterThanOrEqual(0);
        expect(d.cx + d.r * HALO_SCALE).toBeLessThanOrEqual(SVG_W);
        expect(d.cy - d.r * HALO_SCALE).toBeGreaterThanOrEqual(0);
        expect(d.cy + d.r * HALO_SCALE).toBeLessThanOrEqual(SVG_H);
      }
      const fillsX = Math.abs(Math.min(...xs) - STILL_PAD) < 0.11 && Math.abs(Math.max(...xs) - (SVG_W - STILL_PAD)) < 0.11;
      const fillsY = Math.abs(Math.min(...ys) - STILL_PAD) < 0.11 && Math.abs(Math.max(...ys) - (SVG_H - STILL_PAD)) < 0.11;
      expect(fillsX || fillsY, `up to ${upTo}`).toBe(true);
    }
  });

  it('orders the dots far to near, sizes them from MIN_DOT to MAX_DOT by degree, shrinks dim ones to 0.7 and fills them with DIM_HEX, and haloes the bright', () => {
    const shown = shownUpTo(G, 2);
    const pic = stillPicture(G, shown, brightFor(G, CHAPTERS, 2, shown));
    const p = project2d(G, SVG_W, SVG_H, { pad: STILL_PAD, only: shown });
    expect(pic.dots.map((d) => d.i)).toEqual([...G.nodes.keys()].sort((a, b) => p[a].depth - p[b].depth));
    const radii = degrees(G).map(radiusFor);
    const lo = Math.min(...radii);
    const hi = Math.max(...radii);
    const lit = [RW, PK_A, T2, LP01];
    for (const d of pic.dots) {
      const size = MIN_DOT + ((radii[d.i] - lo) / (hi - lo)) * (MAX_DOT - MIN_DOT);
      expect(d.r).toBeCloseTo(Math.round(size * (lit.includes(d.i) ? 1 : DIM_SCALE) * 10) / 10, 10);
      expect([d.cx, d.cy]).toEqual([p[d.i].x, p[d.i].y]);
      expect(d.label).toBe(G.nodes[d.i].label);
      expect(d.fill).toBe(lit.includes(d.i) ? NODE_HEX[G.nodes[d.i].source] : DIM_HEX);
      expect(d.halo).toBe(lit.includes(d.i) ? 0.22 : 0);
    }
    expect(Math.max(...pic.dots.map((d) => d.r))).toBe(MAX_DOT);
    expect(Math.min(...stillPicture(G, ALL, ALL).dots.map((d) => d.r))).toBe(MIN_DOT);
    // No focus: no halo, nothing shrunk.
    expect(stillPicture(G, ALL, ALL).dots.every((d) => d.halo === 0)).toBe(true);
    expect(stillPicture(G, shownUpTo(G, 1), shownUpTo(G, 1)).dots.map((d) => d.i).sort()).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it('draws the selection’s shown links and a ring around its dot, and nothing for a hidden selection', () => {
    const pic = stillPicture(G, ALL, ALL, T2);
    expect(pic.hot.map((h) => h.key).sort()).toEqual(['4-0', '4-2', '4-7']);
    const p = project2d(G, SVG_W, SVG_H, { pad: STILL_PAD, only: ALL });
    expect(pic.hot.every((h) => h.x1 === p[T2].x && h.y1 === p[T2].y)).toBe(true);
    const dot = pic.dots.find((d) => d.i === T2)!;
    expect(pic.ring).toEqual({ cx: p[T2].x, cy: p[T2].y, r: Math.round((dot.r * 1.4 + 2) * 10) / 10 });
    const hidden = stillPicture(G, shownUpTo(G, 1), shownUpTo(G, 1), T2);
    expect(hidden.hot).toEqual([]);
    expect(hidden.ring).toBeNull();
    expect(stillPicture(G, shownUpTo(G, 1), shownUpTo(G, 1), RW).hot.map((h) => h.key)).toEqual(['0-3']);
  });
});

describe('report-map-view: rail, walk and entry', () => {
  it('railChips: all, the prologue, parvas 1–8 and the finale for ten chapters', () => {
    const chips = railChips(9);
    expect(chips).toHaveLength(11);
    expect(chips.map((c) => c.value)).toEqual([null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chips.map((c) => c.kind)).toEqual(['all', 'prologue', ...new Array(8).fill('chapter'), 'finale']);
    expect(new Set(chips.map((c) => c.key)).size).toBe(11);
  });

  it('the walk starts at the prologue, steps one chapter every 5.2 s, and stops after the last', () => {
    expect(WALK_MS).toBe(5200);
    expect(walkStart(null, 9)).toBe(0);
    expect(walkStart(9, 9)).toBe(0);
    expect(walkStart(4, 9)).toBe(4);
    const seen: number[] = [];
    for (let f: number | null = walkStart(null, 9); f !== null; f = walkNext(f, 9)) seen.push(f);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('entryFor offers the entry of a terlapor whose id is in chapterIds[focus ?? upTo], and nothing else', () => {
    expect(entryFor(G, T2, CHAPTERS, 2, 9)).toBe('T-2');
    expect(entryFor(G, T2, CHAPTERS, null, 2)).toBe('T-2');
    expect(entryFor(G, T2, CHAPTERS, null, 9)).toBeNull();
    expect(entryFor(G, T1, CHAPTERS, 2, 2)).toBeNull();
    expect(entryFor(G, T1, CHAPTERS, 0, 9)).toBe('T-1');
    for (const i of [RW, PERKARA, PK_A, LAPORAN, LP_OUT, LP01]) expect(entryFor(G, i, CHAPTERS, 2, 2)).toBeNull();
  });
});

describe('report-map-view: the scene’s numbers', () => {
  it('sceneInput gives colours from NODE_HEX, radii from degrees, and flags the links that touch the center', () => {
    const input = sceneInput(G);
    expect(input.pos).toBe(G.pos);
    expect(input.radius).toBe(G.radius);
    expect(input.colors).toEqual(G.nodes.map((n) => hexNum(NODE_HEX[n.source])));
    expect(input.radii).toEqual(degrees(G).map(radiusFor));
    expect(input.links.map((l) => l.center)).toEqual([false, false, false, true, true, false, false, true, false]);
    expect(input.links.map((l) => [l.a, l.b, l.kind])).toEqual(G.links.map((l) => [l.a, l.b, l.kind]));
  });

  it('the 3D link colours are LINK_HEX', () => {
    expect(Object.keys(LINK_COLORS).sort()).toEqual(Object.keys(LINK_HEX).sort());
    for (const [k, hex] of Object.entries(LINK_HEX)) expect(LINK_COLORS[k as keyof typeof LINK_COLORS], k).toBe(hexNum(hex));
  });
});

/** Effective opacity of link j in its segment: the material's opacity times its vertex alpha. */
function linkAlpha(lines: THREE.LineSegments[], j: number): number {
  for (const l of lines) {
    const at = (l.userData.links as number[]).indexOf(j);
    if (at < 0) continue;
    const a = (l.geometry.getAttribute('color') as THREE.BufferAttribute).array;
    expect(a[at * 8 + 3]).toBe(a[at * 8 + 7]);
    return (l.material as THREE.LineBasicMaterial).opacity * a[at * 8 + 3];
  }
  throw new Error(`link ${j} is in no segment`);
}
const colorAt = (mesh: THREE.InstancedMesh, i: number) => {
  const c = new THREE.Color();
  mesh.getColorAt(i, c);
  return c;
};
const scaleAt = (mesh: THREE.InstancedMesh, i: number) => {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixScale(m).x;
};

describe('world/report-map: the scene objects, built in node without a renderer', () => {
  const input = sceneInput(G);

  it('one instance per node, at its position and radius, with the given colours', () => {
    const o = buildReportObjects(input);
    expect(o.nodes).toBeInstanceOf(THREE.InstancedMesh);
    expect(o.nodes.count).toBe(G.nodes.length);
    expect(o.nodes.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(o.nodes.geometry).toBeInstanceOf(THREE.SphereGeometry);
    G.nodes.forEach((n, i) => {
      expect(colorAt(o.nodes, i).getHex(), n.id).toBe(input.colors[i]);
      const m = new THREE.Matrix4();
      o.nodes.getMatrixAt(i, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      expect(p.toArray()).toEqual([G.pos[i * 3], G.pos[i * 3 + 1], G.pos[i * 3 + 2]]);
      expect(scaleAt(o.nodes, i)).toBeCloseTo(input.radii[i], 6);
    });
    expect(o.group.children).toContain(o.nodes);
    o.dispose();
  });

  it('one LineSegments per kind, with the links that touch the center in their own segments', () => {
    const o = buildReportObjects(input);
    const seen: number[] = [];
    const groups = o.lines.map((l) => `${l.userData.kind}|${l.userData.center}`);
    expect(new Set(groups).size).toBe(groups.length);
    expect(groups.sort()).toEqual(['in-allegation|true', 'member|false', 'out-response|false', 'out-response|true']);
    for (const l of o.lines) {
      expect(l).toBeInstanceOf(THREE.LineSegments);
      expect(o.group.children).toContain(l);
      const pos = l.geometry.getAttribute('position');
      const ids = l.userData.links as number[];
      expect(pos.count).toBe(ids.length * 2);
      ids.forEach((j, m) => {
        const k = input.links[j];
        expect(k.kind).toBe(l.userData.kind);
        expect(k.center).toBe(l.userData.center);
        expect([pos.getX(m * 2), pos.getY(m * 2), pos.getZ(m * 2)]).toEqual(G.pos.slice(k.a * 3, k.a * 3 + 3));
        expect([pos.getX(m * 2 + 1), pos.getY(m * 2 + 1), pos.getZ(m * 2 + 1)]).toEqual(G.pos.slice(k.b * 3, k.b * 3 + 3));
        seen.push(j);
      });
    }
    sameSet(seen, input.links.map((_, j) => j));
    // out-response has links on both sides of the split: two segments, one of them only the center's.
    const out = o.lines.filter((l) => l.userData.kind === 'out-response');
    expect(out.map((l) => l.userData.center).sort()).toEqual([false, true]);
    const centerOut = out.find((l) => l.userData.center)!;
    for (const j of centerOut.userData.links as number[]) expect(input.links[j].a === RW || input.links[j].b === RW).toBe(true);
    o.dispose();
  });

  it('link materials keep the /pantau colours, and links open at the /pantau opacities: 0.025 touching the center, 0.22 for members, 0.5 for the rest', () => {
    expect(linkOpacity('out-response', true)).toBe(0.025);
    for (const [k, c] of [['member', false], ['against', false], ['out-response', true]] as const) expect(litLinkOpacity(k, c), k).toBeGreaterThan(linkOpacity(k, c));
    expect(linkOpacity('member', false)).toBe(0.22);
    expect(linkOpacity('against', false)).toBe(0.5);
    expect(dimLinkOpacity(false)).toBe(0.06);
    expect(dimLinkOpacity(true)).toBe(0.01);
    const o = buildReportObjects(input);
    for (const l of o.lines) {
      const m = l.material as THREE.LineBasicMaterial;
      expect(m).toBeInstanceOf(THREE.LineBasicMaterial);
      expect(m.color.getHex()).toBe(LINK_COLORS[l.userData.kind as keyof typeof LINK_COLORS]);
      expect(m.opacity).toBe(1);
      for (const j of l.userData.links as number[]) expect(linkAlpha(o.lines, j)).toBeCloseTo(linkOpacity(l.userData.kind, l.userData.center), 6);
      expect(m.transparent).toBe(true);
      expect(m.vertexColors).toBe(true);
      expect(l.geometry.getAttribute('color').itemSize).toBe(4);
    }
    o.dispose();
  });

  it('holds no sprite, no canvas texture and no text: only meshes and lines with plain materials', () => {
    const o = buildReportObjects(input);
    o.group.traverse((x) => {
      expect((x as THREE.Sprite).isSprite, x.type).toBeFalsy();
      expect(['Group', 'Mesh', 'LineSegments']).toContain(x.type);
      const mat = (x as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) {
        expect(['MeshBasicMaterial', 'LineBasicMaterial']).toContain(mat.type);
        expect((mat as THREE.MeshBasicMaterial).map ?? null).toBeNull();
      }
    });
    o.dispose();
  });

  it('dispose() frees every geometry and material once, and the instanced buffers, and leaves its parent', () => {
    const o = buildReportObjects(input);
    const parent = new THREE.Group();
    parent.add(o.group);
    const owned = new Set<Disposable>();
    o.group.traverse((x) => {
      const g = (x as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      const m = (x as THREE.Mesh).material as THREE.Material | undefined;
      if (g) owned.add(g);
      if (m) owned.add(m);
    });
    expect(owned.size).toBe(2 + 2 + 2 * o.lines.length + 2 + 2);
    const times = new Map<unknown, number>();
    for (const r of owned) r.addEventListener('dispose', () => times.set(r, (times.get(r) ?? 0) + 1));
    let instanced = 0;
    o.nodes.addEventListener('dispose', () => instanced++);
    o.halos.addEventListener('dispose', () => instanced++);
    o.dispose();
    for (const r of owned) expect(times.get(r), (r as { type?: string }).type).toBe(1);
    expect(instanced).toBe(2);
    expect(o.group.parent).toBeNull();
  });

  it('the first setState snaps to the state: hidden nodes shrink and their links vanish, with nothing left to ease', () => {
    const o = buildReportObjects(input);
    const shown = shownUpTo(G, 1);
    o.setState(shown, brightFor(G, CHAPTERS, null, shown), null, 0);
    expect(o.tick(0)).toBe(false);
    for (const i of [T2, LP01]) expect(scaleAt(o.nodes, i)).toBeLessThan(0.001);
    for (const i of [RW, T1, LAPORAN]) expect(scaleAt(o.nodes, i)).toBeCloseTo(input.radii[i], 6);
    input.links.forEach((l, j) => {
      const vis = shown[l.a] && shown[l.b];
      expect(linkAlpha(o.lines, j), `link ${j}`).toBeCloseTo(vis ? linkOpacity(l.kind, l.center) : 0, 6);
    });
    for (const i of [RW, T1]) expect(colorAt(o.nodes, i).getHex()).toBe(input.colors[i]);
    o.dispose();
  });

  it('with a focus, dim nodes turn DIM at 0.7 of their size, bright ones keep their colour and get a halo, links between them strengthen and dim links drop to 0.06, or 0.01 touching the center', () => {
    const o = buildReportObjects(input);
    const shown = shownUpTo(G, 2);
    const bright = brightFor(G, CHAPTERS, 2, shown);
    o.setState(shown, bright, null, 0, 3);
    G.nodes.forEach((_, i) => {
      expect(colorAt(o.nodes, i).getHex(), G.nodes[i].id).toBe(bright[i] ? input.colors[i] : hexNum(DIM_HEX));
      expect(scaleAt(o.nodes, i), G.nodes[i].id).toBeCloseTo(input.radii[i] * 3 * (bright[i] ? 1 : DIM_SIZE), 5);
      const glow = colorAt(o.halos, i);
      if (bright[i]) {
        expect(glow.r + glow.g + glow.b).toBeCloseTo(new THREE.Color(input.colors[i]).multiplyScalar(HALO_GLOW).toArray().reduce((s, v) => s + v, 0), 5);
        expect(scaleAt(o.halos, i)).toBeCloseTo(input.radii[i] * 3 * HALO_SIZE, 5);
      } else expect(glow.getHex()).toBe(0);
    });
    input.links.forEach((l, j) => {
      const lit = bright[l.a] && bright[l.b];
      expect(linkAlpha(o.lines, j), `link ${j}`).toBeCloseTo(lit ? litLinkOpacity(l.kind, l.center) : dimLinkOpacity(l.center), 6);
    });
    expect(linkAlpha(o.lines, 3)).toBeCloseTo(0.01, 6); // T-1 – the center
    expect(linkAlpha(o.lines, 1)).toBeCloseTo(0.06, 6); // pk:A – T-1
    expect(linkAlpha(o.lines, 4)).toBeCloseTo(litLinkOpacity('out-response', true), 6); // the center – T-2, both bright
    // With no focus, nothing is shrunk, nothing glows, and links keep the /pantau opacities.
    o.setState(ALL, ALL, null, 1000, 3);
    o.tick(1600);
    G.nodes.forEach((_, i) => {
      expect(scaleAt(o.nodes, i)).toBeCloseTo(input.radii[i] * 3, 5);
      expect(colorAt(o.halos, i).getHex()).toBe(0);
    });
    expect(linkAlpha(o.lines, 4)).toBeCloseTo(0.025, 6);
    o.dispose();
  });

  it('bright and dim changes ease over 0.6 s: in between at 0.3 s, done at 0.6 s, never a jump', () => {
    expect(EASE_MS).toBe(600);
    const o = buildReportObjects(input);
    o.setState(ALL, ALL, null, 1000);
    o.setState(ALL, brightFor(G, CHAPTERS, 2, ALL), null, 2000);
    expect(colorAt(o.nodes, T1).getHex()).toBe(input.colors[T1]);
    let prev = linkAlpha(o.lines, 1);
    const from = new THREE.Color(input.colors[T1]);
    const to = new THREE.Color(hexNum(DIM_HEX));
    for (let t = 2000; t <= 2600; t += 50) {
      expect(o.tick(t)).toBe(true);
      const a = linkAlpha(o.lines, 1);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      // No step between two frames 50 ms apart is more than a fifth of the way.
      expect(prev - a).toBeLessThan((0.22 - 0.06) / 5);
      prev = a;
    }
    expect(linkAlpha(o.lines, 1)).toBeCloseTo(0.06, 6);
    expect(colorAt(o.nodes, T1).getHex()).toBe(to.getHex());
    expect(o.tick(2700)).toBe(false);
    // Halfway, the colour sits between its two ends.
    o.setState(ALL, ALL, null, 3000);
    o.tick(3300);
    const mid = colorAt(o.nodes, T1);
    expect(mid.r).toBeGreaterThan(Math.min(from.r, to.r));
    expect(mid.r).toBeLessThan(Math.max(from.r, to.r));
    expect(linkAlpha(o.lines, 1)).toBeGreaterThan(0.06);
    expect(linkAlpha(o.lines, 1)).toBeLessThan(0.22);
    o.tick(3600);
    expect(colorAt(o.nodes, T1).getHex()).toBe(input.colors[T1]);
    o.dispose();
  });

  it('a node that comes into the record fades in from the background, and its links from nothing', () => {
    const o = buildReportObjects(input);
    o.setState(shownUpTo(G, 1), shownUpTo(G, 1), null, 0);
    o.setState(ALL, ALL, null, 1000);
    o.tick(1000);
    expect(scaleAt(o.nodes, T2)).toBeLessThan(0.001);
    expect(colorAt(o.nodes, T2).getHex()).toBe(hexNum(BG_HEX));
    expect(linkAlpha(o.lines, 2)).toBe(0);
    o.tick(1300);
    expect(scaleAt(o.nodes, T2)).toBeGreaterThan(0.1);
    expect(scaleAt(o.nodes, T2)).toBeLessThan(input.radii[T2]);
    o.tick(1600);
    expect(colorAt(o.nodes, T2).getHex()).toBe(input.colors[T2]);
    expect(scaleAt(o.nodes, T2)).toBeCloseTo(input.radii[T2], 6);
    expect(linkAlpha(o.lines, 2)).toBeCloseTo(0.22, 6);
    o.dispose();
  });

  it('the selection draws white lines to its shown neighbours, on top, and a wireframe ring at r × 1.4 + 0.3', () => {
    const o = buildReportObjects(input);
    o.setState(ALL, ALL, T2, 0);
    const hot = o.hot.material as THREE.LineBasicMaterial;
    expect(hot.color.getHex()).toBe(0xffffff);
    expect(hot.opacity).toBe(0.95);
    expect(hot.depthTest).toBe(false);
    expect(o.hot.visible).toBe(true);
    const pos = o.hot.geometry.getAttribute('position');
    const n = o.hot.geometry.drawRange.count / 2;
    expect(n).toBe(neighbours(G, T2, ALL).length);
    const ends: number[][] = [];
    for (let m = 0; m < n; m++) {
      expect([pos.getX(m * 2), pos.getY(m * 2), pos.getZ(m * 2)]).toEqual(G.pos.slice(T2 * 3, T2 * 3 + 3));
      ends.push([pos.getX(m * 2 + 1), pos.getY(m * 2 + 1), pos.getZ(m * 2 + 1)]);
    }
    expect(ends.map((e) => JSON.stringify(e)).sort()).toEqual(neighbours(G, T2, ALL).map((x) => JSON.stringify(G.pos.slice(x.other * 3, x.other * 3 + 3))).sort());
    expect((o.ring.material as THREE.MeshBasicMaterial).wireframe).toBe(true);
    expect(o.ring.visible).toBe(true);
    expect(o.ring.position.toArray()).toEqual(G.pos.slice(T2 * 3, T2 * 3 + 3));
    expect(o.ring.scale.x).toBeCloseTo(input.radii[T2] * 1.4 + 0.3, 5);
    // Up to chapter 1 the center keeps only T-1; T-2 cannot be selected.
    o.setState(shownUpTo(G, 1), shownUpTo(G, 1), RW, 100);
    expect(o.hot.geometry.drawRange.count).toBe(2);
    o.setState(shownUpTo(G, 1), shownUpTo(G, 1), T2, 200);
    expect(o.hot.visible).toBe(false);
    expect(o.ring.visible).toBe(false);
    o.setState(ALL, ALL, null, 300);
    expect(o.hot.visible).toBe(false);
    expect(o.ring.visible).toBe(false);
    o.dispose();
  });

  it('pick() returns the nearest shown node under the ray, never a hidden one', () => {
    const o = buildReportObjects(input);
    o.group.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.5, 200);
    camera.position.set(30, 10, 40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const at = (i: number) => {
      const v = new THREE.Vector3(G.pos[i * 3], G.pos[i * 3 + 1], G.pos[i * 3 + 2]).project(camera);
      ray.setFromCamera(new THREE.Vector2(v.x, v.y), camera);
      return o.pick(ray);
    };
    o.setState(ALL, ALL, null, 0);
    expect(at(T2)).toBe(T2);
    expect(at(RW)).toBe(RW);
    ray.setFromCamera(new THREE.Vector2(0.95, 0.95), camera);
    expect(o.pick(ray)).toBeNull();
    o.setState(shownUpTo(G, 1), shownUpTo(G, 1), null, 100);
    expect(at(T2)).toBeNull();
    o.dispose();
  });

  it('fitView keeps every shown node, its halo included, inside the view frustum from any direction, at 16:10 and at a phone’s aspect', () => {
    const real = gameData(JSON.parse(read('src/data/perkara.json'))).report.map;
    const cases: { g: MapGraph; upTo: number; focus: number | null; chapters: readonly (readonly string[])[] }[] = [
      { g: G, upTo: 1, focus: null, chapters: CHAPTERS },
      { g: G, upTo: 2, focus: 2, chapters: CHAPTERS },
      { g: G, upTo: 9, focus: null, chapters: CHAPTERS },
      ...[0, 1, 3, 4, 6, 9].map((c) => ({ g: real, upTo: c, focus: c, chapters: chapterIdsOf(real) })),
      { g: real, upTo: 9, focus: null, chapters: chapterIdsOf(real) },
    ];
    const dirs = [[0.8, 0.25, 1.05], [1, 0, 0], [0, 1, 0.01], [-1, -0.4, 0.2], [0.3, -1, -0.7], [0, 0, -1]];
    for (const { g, upTo, focus, chapters } of cases) {
      const input = sceneInput(g);
      const shown = shownUpTo(g, upTo);
      const bright = brightFor(g, chapters, focus, shown);
      for (const [aspect, heightPx] of [[1.6, 420], [1.6, 200], [0.6, 600], [2.4, 300]]) {
        const f = fitView({ ...input, shown, bright, fov: 50, aspect, heightPx });
        expect(f.scale).toBeGreaterThanOrEqual(1);
        const target = new THREE.Vector3(...f.target);
        for (const d of dirs) {
          const camera = new THREE.PerspectiveCamera(50, aspect, 0.5, (f.distance + f.radius) * 2);
          camera.position.copy(target).addScaledVector(new THREE.Vector3(...d).normalize(), f.distance);
          camera.lookAt(target);
          camera.updateMatrixWorld(true);
          const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
          shown.forEach((on, i) => {
            if (!on) return;
            const c = new THREE.Vector3(input.pos[i * 3], input.pos[i * 3 + 1], input.pos[i * 3 + 2]);
            const r = input.radii[i] * f.scale * HALO_SIZE;
            for (const plane of frustum.planes) expect(plane.distanceToPoint(c), `${g.nodes[i].id} ${aspect} ${d}`).toBeGreaterThanOrEqual(r);
          });
        }
      }
    }
  });

  it('fitView aims at the bright nodes’ centroid (the shown nodes’ without a focus), leaves FIT_MARGIN, and sizes the smallest node to about MIN_NODE_PX', () => {
    const input = sceneInput(G);
    const shown = shownUpTo(G, 2);
    const bright = brightFor(G, CHAPTERS, 2, shown);
    const f = fitView({ ...input, shown, bright, fov: 50, aspect: 1.6, heightPx: 400 });
    const centroid = (ids: number[]) => [0, 1, 2].map((k) => ids.reduce((s, i) => s + G.pos[i * 3 + k], 0) / ids.length);
    f.target.forEach((v, k) => expect(v).toBeCloseTo(centroid([RW, PK_A, T2, LP01])[k], 10));
    const none = fitView({ ...input, shown: ALL, bright: ALL, fov: 50, aspect: 1.6, heightPx: 400 });
    none.target.forEach((v, k) => expect(v).toBeCloseTo(centroid([...G.nodes.keys()])[k], 10));
    // The framed sphere holds the farthest node's halo, with the margin, and the narrower field of view fits it.
    const t = new THREE.Vector3(...f.target);
    const reach = Math.max(...shown.flatMap((on, i) => (on ? [t.distanceTo(new THREE.Vector3(...G.pos.slice(i * 3, i * 3 + 3))) + input.radii[i] * f.scale * HALO_SIZE] : [])));
    expect(f.radius).toBeCloseTo(reach * (1 + FIT_MARGIN), 6);
    expect(f.distance).toBeCloseTo(f.radius / Math.sin((25 * Math.PI) / 180), 6);
    // On the real record, the smallest node is drawn at about MIN_NODE_PX at the target's depth, on a desktop stage and a phone's.
    const real = gameData(JSON.parse(read('src/data/perkara.json'))).report.map;
    const ri = sceneInput(real);
    for (const heightPx of [420, 200]) {
      const rs = shownUpTo(real, 3);
      const rf = fitView({ ...ri, shown: rs, bright: brightFor(real, chapterIdsOf(real), 3, rs), fov: 50, aspect: 1.6, heightPx });
      const smallest = Math.min(...ri.radii.filter((_, i) => rs[i]));
      const px = (smallest * rf.scale) / ((2 * rf.distance * Math.tan((25 * Math.PI) / 180)) / heightPx);
      expect(px, `height ${heightPx}`).toBeGreaterThanOrEqual(MIN_NODE_PX * 0.85);
      expect(px).toBeLessThanOrEqual(MIN_NODE_PX * 1.15);
    }
    // Nothing shown: a harmless default, no NaN.
    const empty = fitView({ ...input, shown: ALL.map(() => false), bright: ALL.map(() => false), fov: 50, aspect: 1.6, heightPx: 400 });
    expect([...empty.target, empty.distance, empty.radius, empty.scale].every(Number.isFinite)).toBe(true);
  });

  it('sceneSettings: fog from radius × 1.6 to × 4, the camera at (0.8, 0.25, 1.05) × radius, damped orbit, slow auto-rotation unless reduced', () => {
    const s = sceneSettings(50, false);
    expect(s.fog).toEqual({ near: 80, far: 200 });
    expect(s.camera.position).toEqual([40, 12.5, 52.5]);
    expect(s.camera.far).toBe(400);
    expect(s.controls).toEqual({ dampingFactor: 0.08, minDistance: 8, maxDistance: 200, autoRotate: true, autoRotateSpeed: 0.4 });
    expect(sceneSettings(50, true).controls.autoRotate).toBe(false);
  });
});

// ── createReportMap against the stub renderer ──────────────────────────────────────────────────────────────────────────

type Listener = (e: unknown) => void;
class Target {
  map = new Map<string, Set<Listener>>();
  addEventListener(t: string, f: Listener) {
    if (!this.map.has(t)) this.map.set(t, new Set());
    this.map.get(t)!.add(f);
  }
  removeEventListener(t: string, f: Listener) {
    this.map.get(t)?.delete(f);
  }
  emit(t: string, e: unknown = {}) {
    for (const f of [...(this.map.get(t) ?? [])]) f(e);
  }
  get listeners() {
    return [...this.map.values()].reduce((n, s) => n + s.size, 0);
  }
}

/** A page with one 640 × 400 canvas, a document, a manual frame clock and performance.now on the same clock. */
function fakePage() {
  const doc = Object.assign(new Target(), { hidden: false });
  const canvas = Object.assign(new Target(), {
    style: {} as Record<string, string>,
    clientWidth: 640,
    clientHeight: 400,
    ownerDocument: doc,
    getRootNode: () => doc,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 640, bottom: 400, width: 640, height: 400, x: 0, y: 0 }),
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
  });
  const frames = new Map<number, (t: number) => void>();
  let id = 0;
  let clock = 1000;
  vi.stubGlobal('window', { devicePixelRatio: 3 });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => {
    frames.set(++id, f);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (i: number) => {
    frames.delete(i);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  /** Runs the frames that are due, `ms` later; returns how many ran. */
  const run = (ms = 16) => {
    clock += ms;
    const due = [...frames.values()];
    frames.clear();
    for (const f of due) f(clock);
    return due.length;
  };
  const pointer = (type: string, x: number, y: number, target: Target = canvas) =>
    target.emit(type, { type, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault() {} });
  return { doc, canvas, frames, run, pointer, advance: (ms: number) => { clock += ms; } };
}

function open(page: ReturnType<typeof fakePage>, reducedMotion: boolean, calls: { hover: (number | null)[]; pick: (number | null)[] } = { hover: [], pick: [] }) {
  const api = createReportMap({
    ...sceneInput(G),
    canvas: page.canvas as unknown as HTMLCanvasElement,
    reducedMotion,
    onHover: (i) => calls.hover.push(i),
    onPick: (i) => calls.pick.push(i),
  });
  return { api, calls, renderer: stub.made[stub.made.length - 1] };
}

/** Where node i lands on the 640 × 400 canvas once the whole record is framed, seen from the opening direction. */
function screenOf(i: number): [number, number] {
  const s = sceneSettings(G.radius, true);
  const f = fitView({ ...sceneInput(G), shown: ALL, bright: ALL, fov: s.camera.fov, aspect: 640 / 400, heightPx: 400 });
  const camera = new THREE.PerspectiveCamera(s.camera.fov, 640 / 400, s.camera.near, (f.distance + f.radius) * 2);
  const target = new THREE.Vector3(...f.target);
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...s.camera.position).normalize(), f.distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const v = new THREE.Vector3(G.pos[i * 3], G.pos[i * 3 + 1], G.pos[i * 3 + 2]).project(camera);
  return [((v.x + 1) / 2) * 640, ((1 - v.y) / 2) * 400];
}

describe('world/report-map: createReportMap with a stub renderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('caps the pixel ratio at 2, clears to the background, antialiases, sizes to the canvas and keeps OrbitControls’ touch-action', () => {
    const page = fakePage();
    const { api, renderer } = open(page, true);
    expect(renderer.params.canvas).toBe(page.canvas);
    expect(renderer.params.antialias).toBe(true);
    expect(renderer.pixelRatio).toBe(2);
    expect(renderer.clear).toEqual([0x0b1020, 1]);
    expect(renderer.size).toEqual([640, 400]);
    expect(page.canvas.style.touchAction).toBe('none');
    api.dispose();
  });

  it('reports hover and a short press as a pick at a node’s screen position, and empty space as null', () => {
    const page = fakePage();
    const { api, calls } = open(page, true);
    api.setState(ALL, ALL, null);
    page.run();
    const [x, y] = screenOf(RW);
    page.pointer('pointermove', x, y);
    expect(calls.hover.at(-1)).toBe(RW);
    page.pointer('pointerdown', x, y);
    page.advance(80);
    page.pointer('pointerup', x, y);
    page.pointer('pointerup', x, y, page.doc);
    expect(calls.pick).toEqual([RW]);
    page.pointer('pointermove', 2, 2);
    expect(calls.hover.at(-1)).toBeNull();
    page.pointer('pointerdown', 2, 2);
    page.pointer('pointerup', 2, 2);
    page.pointer('pointerup', 2, 2, page.doc);
    expect(calls.pick).toEqual([RW, null]);
    // A drag is a turn, not a pick.
    page.pointer('pointerdown', x, y);
    page.pointer('pointerup', x + 40, y);
    page.pointer('pointerup', x + 40, y, page.doc);
    expect(calls.pick).toEqual([RW, null]);
    page.canvas.emit('pointerleave', { pointerType: 'mouse' });
    expect(calls.hover.at(-1)).toBeNull();
    api.dispose();
  });

  it('auto-rotates until the player turns the map, then idles once it settles; under reduced motion it never auto-rotates', () => {
    const page = fakePage();
    const { api, renderer } = open(page, false);
    api.setState(ALL, ALL, null);
    for (let f = 0; f < 30; f++) expect(page.run()).toBe(1);
    const turning = renderer.renders;
    expect(turning).toBeGreaterThanOrEqual(29);
    // A press stops the auto-rotation; once released and settled, frames stop.
    page.pointer('pointerdown', 300, 200);
    page.pointer('pointerup', 300, 200, page.doc);
    let n = 0;
    while (page.frames.size > 0 && n < 400) { page.run(); n++; }
    expect(page.frames.size).toBe(0);
    // Nothing moves, nothing is drawn.
    const settled = renderer.renders;
    page.run();
    expect(renderer.renders).toBe(settled);
    // A new focus wakes it for the 1.2 s camera move (the 0.6 s ease runs inside it), then it idles again.
    api.setState(ALL, brightFor(G, CHAPTERS, 2, ALL), null);
    n = 0;
    while (page.frames.size > 0 && n < 400) { page.run(); n++; }
    expect(renderer.renders - settled).toBeGreaterThanOrEqual(FIT_MS / 16);
    expect(renderer.renders - settled).toBeLessThan(FIT_MS / 16 + 6);
    api.dispose();

    const still = fakePage();
    const r = open(still, true);
    r.api.setState(ALL, ALL, null);
    let m = 0;
    while (still.frames.size > 0 && m < 50) { still.run(); m++; }
    expect(still.frames.size).toBe(0);
    expect(r.renderer.renders).toBeGreaterThan(0);
    expect(r.renderer.renders).toBeLessThan(5);
    // The same state again, in new arrays (a screen re-rendering), wakes nothing.
    r.api.setState([...ALL], ALL.map(() => true), null);
    expect(still.frames.size).toBe(0);
    r.api.setState(ALL, ALL, RW);
    expect(still.frames.size).toBe(1);
    r.api.dispose();
  });

  it('frames the shown nodes at once when it opens, then eases over 1.2 s to frame this chapter’s people; under reduced motion it jumps', () => {
    const camOf = (r: InstanceType<typeof stub.StubRenderer>) => {
      const c = r.camera as unknown as THREE.PerspectiveCamera;
      return { at: c.position.clone(), look: c.getWorldDirection(new THREE.Vector3()) };
    };
    const looksAt = (r: InstanceType<typeof stub.StubRenderer>, f: { target: number[]; distance: number }) => {
      const { at, look } = camOf(r);
      const t = new THREE.Vector3(...f.target);
      expect(at.distanceTo(t)).toBeCloseTo(f.distance, 3);
      expect(look.dot(t.clone().sub(at).normalize())).toBeCloseTo(1, 5);
    };
    const fitFor = (shown: boolean[], bright: boolean[]) => fitView({ ...sceneInput(G), shown, bright, fov: 50, aspect: 640 / 400, heightPx: 400 });
    for (const reduced of [true, false]) {
      const page = fakePage();
      const { api, renderer } = open(page, reduced);
      const shown1 = shownUpTo(G, 1);
      api.setState(shown1, shown1, null);
      page.run();
      looksAt(renderer, fitFor(shown1, shown1));
      const shown2 = shownUpTo(G, 2);
      const bright2 = brightFor(G, CHAPTERS, 2, shown2);
      api.setState(shown2, bright2, null);
      page.run(600);
      if (reduced) looksAt(renderer, fitFor(shown2, bright2));
      else {
        // Halfway there: neither the old framing nor the new.
        const half = camOf(renderer).at;
        expect(half.distanceTo(new THREE.Vector3(...fitFor(shown2, bright2).target))).not.toBeCloseTo(fitFor(shown2, bright2).distance, 1);
        page.run(700);
        page.run();
        looksAt(renderer, fitFor(shown2, bright2));
      }
      api.dispose();
    }
  });

  it('pauses while the document is hidden and while the canvas is off screen, and resumes after', () => {
    let seen: ((e: { isIntersecting: boolean }[]) => void) | null = null;
    let observing = 0;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) { seen = cb; }
      observe() { observing++; }
      disconnect() { observing--; }
    });
    const page = fakePage();
    const { api, renderer } = open(page, false);
    expect(observing).toBe(1);
    page.run();
    page.doc.hidden = true;
    const before = renderer.renders;
    page.run();
    expect(page.frames.size).toBe(0);
    page.run();
    expect(renderer.renders).toBe(before);
    page.doc.hidden = false;
    page.doc.emit('visibilitychange');
    expect(page.frames.size).toBe(1);
    page.run();
    expect(renderer.renders).toBe(before + 1);
    seen!([{ isIntersecting: false }]);
    page.run();
    expect(page.frames.size).toBe(0);
    seen!([{ isIntersecting: true }]);
    expect(page.frames.size).toBe(1);
    api.dispose();
    expect(observing).toBe(0);
  });

  it('dispose() stops the loop, removes every listener, frees everything, then disposes the renderer and forces context loss: ten times over', () => {
    const page = fakePage();
    const disposed = new Set<Disposable>();
    const owned = new Set<Disposable>();
    const spy = vi.spyOn(THREE.Scene.prototype, 'add');
    const apis: ReportMapApi[] = [];
    for (let k = 0; k < 10; k++) {
      const { api } = open(page, false);
      api.setState(ALL, ALL, k % 2 ? T2 : null);
      page.run();
      const group = spy.mock.calls.at(-1)![0] as THREE.Object3D;
      group.traverse((x) => {
        const parts: (Disposable | undefined)[] = [(x as THREE.Mesh).geometry, (x as THREE.Mesh).material as THREE.Material | undefined];
        for (const r of parts) {
          if (!r) continue;
          owned.add(r);
          r.addEventListener('dispose', () => disposed.add(r));
        }
      });
      apis.push(api);
      expect(page.canvas.listeners).toBeGreaterThan(0);
      api.dispose();
      expect(page.frames.size).toBe(0);
      expect(page.canvas.listeners).toBe(0);
      expect(page.doc.listeners).toBe(0);
    }
    expect(stub.made.slice(-10).map((r) => r.calls)).toEqual(new Array(10).fill(['dispose', 'forceContextLoss']));
    expect([...owned].filter((r) => !disposed.has(r))).toEqual([]);
    // A second dispose is harmless, and a disposed map no longer draws.
    apis[0].dispose();
    apis[0].setState(ALL, ALL, null);
    apis[0].resize();
    expect(page.frames.size).toBe(0);
    expect(stub.made.at(-10)!.calls).toEqual(['dispose', 'forceContextLoss']);
  });
});

// ── The component ──────────────────────────────────────────────────────────────────────────────────────────────────────

type MapProps = Parameters<typeof ReportMap>[0];
const html = (p: Partial<MapProps> = {}) =>
  renderToString(<ReportMap locale="id" graph={G} chapterIds={CHAPTERS} upTo={9} focus={null} allow3d labels={LABELS} {...p} />);
const ariaLabels = (h: string) => [...h.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);
const titles = (h: string) => [...h.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);

describe('ReportMap (renderToString)', () => {
  it('renders the still SVG first: the class, viewBox 640 × 400, role img and the map’s aria label', () => {
    const h = html();
    expect(h).toContain(`<svg class="bg-map__svg" viewBox="0 0 640 400" role="img" aria-label="${LABELS.aria}"`);
    expect(h).not.toContain('<canvas');
    expect(h).toContain(LABELS.title);
  });

  it('one dot per shown node, each titled with its label, with a halo behind it; unshown nodes are absent', () => {
    expect(html().match(/<g class="bg-map__halo">([\s\S]*?)<\/g>/)![1].match(/<circle /g)).toHaveLength(G.nodes.length);
    expect(html({ upTo: 2, focus: 2 })).toContain('fill-opacity="0.22"');
    const h = html();
    expect(h.match(/<circle data-i=/g)).toHaveLength(G.nodes.length);
    expect(titles(h).sort()).toEqual([...LABEL_LIST].sort());
    const early = html({ upTo: 1 });
    expect(early.match(/<circle data-i=/g)).toHaveLength(6);
    expect(titles(early).sort()).toEqual(LABEL_LIST.filter((_, i) => i !== T2 && i !== LP01).sort());
    for (const gone of ['Nama Dua', 'LP-01']) expect(early).not.toContain(gone);
    expect(early.match(/<line /g)).toHaveLength(4);
  });

  it('labels.names shows a hub or group by its given name in place of the graph label, and leaves the rest alone', () => {
    const names = { perkara: 'Accused', 'lp:out': 'by the Pelapor', missing: 'Nobody' };
    const h = html({ labels: { ...LABELS, names } });
    const t = titles(h);
    expect(t).toContain('Accused');
    expect(t).toContain('by the Pelapor');
    expect(t).not.toContain('Terlapor');
    expect(t).not.toContain('oleh Pelapor');
    for (const keep of ['Nama Satu', 'Nama Dua', 'LP-01', 'Laporan polisi']) expect(t).toContain(keep);
    expect(namedGraph(G, undefined)).toBe(G);
    expect(namedGraph(G, { missing: 'x' })).toBe(G);
    const named = namedGraph(G, names);
    expect(named.nodes[PERKARA].label).toBe('Accused');
    expect(named.nodes[T1]).toBe(G.nodes[T1]);
    expect(named.links).toBe(G.links);
    expect(G.nodes[PERKARA].label).toBe('Terlapor');
  });

  it('draws links first, then the dots far to near', () => {
    const h = html();
    expect(h.indexOf('<line ')).toBeLessThan(h.indexOf('<circle '));
    const p = project2d(G, 640, 400);
    const order = [...G.nodes.keys()].sort((a, b) => p[a].depth - p[b].depth).map((i) => G.nodes[i].label);
    expect(titles(h)).toEqual(order);
  });

  it('no aria-label names anyone: the svg’s equals labels.aria, the rail’s labels.rail.label', () => {
    const h = html({ rail: true, focus: 2 });
    const labels = ariaLabels(h);
    expect(labels).toContain(LABELS.aria);
    expect(labels).toContain(LABELS.rail.label);
    for (const a of labels) for (const name of LABEL_LIST) expect(a, a).not.toContain(name);
  });

  it('the legend lists the 3 sources, the 4 link kinds, the bright/dim line and the size line', () => {
    const h = html();
    const legend = h.match(/<ul class="bg-map__legend">([\s\S]*?)<\/ul>/)![1];
    expect(legend.match(/data-source="/g)).toHaveLength(3);
    expect(legend.match(/data-link="/g)).toHaveLength(4);
    for (const s of Object.values(LABELS.sources)) expect(legend).toContain(s);
    for (const k of Object.values(LABELS.links)) expect(legend).toContain(k);
    for (const s of [LABELS.bright, LABELS.dim, LABELS.size]) expect(legend).toContain(s);
    for (const hex of [...Object.values(NODE_HEX), ...Object.values(LINK_HEX), DIM_HEX]) expect(legend).toContain(hex);
  });

  it('with rail: 11 chips, "all" pressed when the focus is null, a chapter’s chip when focused, and the walk button; without, no rail', () => {
    const h = html({ rail: true });
    const rail = h.match(/<div class="bg-map__rail" role="group" aria-label="Rel parva">([\s\S]*?)<\/div>/)![1];
    const chips = [...rail.matchAll(/<button type="button" class="bg-map__chip" aria-pressed="(true|false)">([^<]*)<\/button>/g)];
    expect(chips).toHaveLength(11);
    expect(chips.map((c) => c[2])).toEqual(['Semua', 'Prolog', ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Parva ${n}`), 'Akhir']);
    expect(chips.map((c) => c[1])).toEqual(['true', ...new Array(10).fill('false')]);
    expect(rail).toContain(`class="bg-map__walk">${LABELS.rail.walk}</button>`);
    const two = [...html({ rail: true, focus: 2 }).matchAll(/class="bg-map__chip" aria-pressed="(true|false)">([^<]*)</g)];
    expect(two.filter((c) => c[1] === 'true').map((c) => c[2])).toEqual(['Parva 2']);
    expect(html()).not.toContain('bg-map__rail');
  });

  it('dims the nodes outside the focus, and draws their links at 0.12', () => {
    const h = html({ upTo: 2, focus: 2 });
    const fills = new Map([...h.matchAll(/<circle [^>]*fill="(#[0-9a-f]{6})"[^>]*><title>([^<]*)<\/title>/g)].map((m) => [m[2], m[1]]));
    expect(fills.get('Nama Satu')).toBe(DIM_HEX);
    expect(fills.get('Nama Dua')).toBe(NODE_HEX.perkara);
    expect(fills.get('LP-01')).toBe(NODE_HEX.laporan);
    expect(fills.get('Pusat Satu')).toBe(NODE_HEX.rw);
    expect(fills.get('Laporan polisi')).toBe(DIM_HEX);
    expect(h).toContain('stroke-opacity="0.12"');
  });

  it('has no NaN, no canvas, no tooltip and no still note at first, and an empty live panel', () => {
    for (const h of [html(), html({ upTo: 0, focus: 0, rail: true }), html({ allow3d: false, upTo: 6, focus: 6 })]) {
      expect(h).not.toContain('NaN');
      expect(h).not.toContain('<canvas');
      expect(h).not.toContain('role="tooltip"');
      expect(h).not.toContain('bg-map__still');
      expect(h).toMatch(/<aside class="bg-map__panel" aria-live="polite"[^>]*><\/aside>/);
    }
    // A graph with one node on one spot still draws without NaN.
    const one: MapGraph = { nodes: G.nodes.slice(0, 1), links: [], pos: [0, 0, 0], radius: 1 };
    expect(html({ graph: one })).not.toContain('NaN');
  });
});

// ── Source checks ──────────────────────────────────────────────────────────────────────────────────────────────────────

const WORLD_SRC = read('src/lib/bowobharata-game/world/report-map.ts');
const VIEW_SRC = read('src/lib/bowobharata-game/report-map-view.ts');
const MAP_SRC = read('src/components/bowobharata-game/ReportMap.tsx');
const CSS_SRC = read('src/styles/bowobharata-game-map.css').replace(/\/\*[\s\S]*?\*\//g, '');
/** The 74 THREE names pinned by the layers test, read from it so the two never drift. */
const BASE_THREE = new Set(
  [...read('tests/bowobharata-game-layers.test.ts').match(/const BASE_THREE = new Set\(\[([\s\S]*?)\]\);/)![1].matchAll(/'(\w+)'/g)].map((m) => m[1]),
);

describe('source checks', () => {
  it('world/report-map.ts imports only three and OrbitControls', () => {
    const specs = [...WORLD_SRC.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(specs)).toEqual(new Set(['three', 'three/examples/jsm/controls/OrbitControls.js']));
  });

  it('every THREE.X in world/report-map.ts is on the allow-list the layers test pins', () => {
    expect(BASE_THREE.size).toBe(74);
    const used = [...new Set([...WORLD_SRC.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((n) => !BASE_THREE.has(n))).toEqual([]);
  });

  it('world/report-map.ts draws no text, casts no shadow, caps the pixel ratio and frees its context on dispose', () => {
    expect(WORLD_SRC).not.toMatch(/fillText|Sprite|CanvasTexture|TextGeometry/);
    expect(WORLD_SRC).not.toMatch(/shadowMap|castShadow|receiveShadow|EffectComposer/);
    expect(WORLD_SRC).toMatch(/setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 2\)\)/);
    expect(WORLD_SRC).toMatch(/renderer\.dispose\(\);\s*renderer\.forceContextLoss\(\);/);
    expect(WORLD_SRC).toContain("addEventListener('visibilitychange'");
    expect(WORLD_SRC).toContain('document.hidden');
  });

  it('report-map-view.ts is pure: no clock, no randomness, no DOM and no three', () => {
    expect(VIEW_SRC).not.toMatch(/Math\.random|Date\.now|new Date|performance\.now|window\.|document\.|from 'three'/);
    expect([...VIEW_SRC.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual(['./report-types']);
  });

  it('ReportMap.tsx imports its CSS once, first, and reaches the scene only by dynamic import', () => {
    expect(MAP_SRC.match(/bowobharata-game-map\.css/g)).toHaveLength(1);
    const firstImport = MAP_SRC.match(/^import .*$/m)![0];
    expect(firstImport).toBe("import '../../styles/bowobharata-game-map.css';");
    expect(MAP_SRC).toContain("import('../../lib/bowobharata-game/world/report-map')");
    expect(MAP_SRC).not.toMatch(/from 'three'/);
    for (const m of MAP_SRC.matchAll(/^import (.*) from '([^']*world\/report-map)';$/gm)) expect(m[1], m[2]).toMatch(/^type /);
  });

  it('the WebGL probe asks for webgl2 or webgl, as /pantau does, and releases its context', () => {
    expect(MAP_SRC).toMatch(/getContext\('webgl2'\) \|\| \w+\.getContext\('webgl'\)/);
    expect(MAP_SRC).toContain("getExtension('WEBGL_lose_context')");
    expect(MAP_SRC).toContain('loseContext()');
  });
});

// ── The map's CSS ──────────────────────────────────────────────────────────────────────────────────────────────────────

interface Rule { selector: string; body: string; media: string | null }
/** Every `selector { body }` block, with the @media query it sits in. */
const RULES: Rule[] = (() => {
  const out: Rule[] = [];
  const re = /@media([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}/g;
  for (const m of CSS_SRC.matchAll(re)) {
    if (m[1] !== undefined) {
      for (const r of m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: r[1].trim().replace(/\s+/g, ' '), body: r[2].trim(), media: m[1].trim() });
    } else out.push({ selector: m[3].trim().replace(/\s+/g, ' '), body: m[4].trim(), media: null });
  }
  return out;
})();
const declared = (sel: string, prop: string, media: string | null = null) =>
  RULES.filter((r) => r.media === media && r.selector.split(',').map((s) => s.trim()).includes(sel))
    .flatMap((r) => r.body.split(';').map((d) => d.trim()).filter((d) => d.startsWith(`${prop}:`)).map((d) => d.slice(prop.length + 1).trim()));

describe('bowobharata-game-map.css', () => {
  it('the stage is 16:10 and at most 60vh tall; the svg and canvas fill it; the canvas keeps touch-action none', () => {
    expect(declared('.bg-map__stage', 'aspect-ratio')).toEqual(['16 / 10']);
    expect(declared('.bg-map__stage', 'max-height')).toEqual(['60vh']);
    expect(declared('.bg-map__stage', 'position')).toEqual(['relative']);
    expect(declared('.bg-map__stage', 'overflow')).toEqual(['hidden']);
    expect(declared('.bg-map__canvas', 'touch-action')).toEqual(['none']);
    for (const s of ['.bg-map__svg', '.bg-map__canvas']) {
      expect(declared(s, 'width'), s).toEqual(['100%']);
      expect(declared(s, 'height'), s).toEqual(['100%']);
    }
  });

  it('the legend and panel sit beside the stage from 52rem, below it on narrower screens', () => {
    expect(declared('.bg-map__body', 'grid-template-columns')).toEqual(['minmax(0, 1fr)']);
    const wide = declared('.bg-map__body', 'grid-template-columns', '(min-width: 52rem)');
    expect(wide).toHaveLength(1);
    expect(wide[0]).toMatch(/^minmax\(0, 1fr\) minmax\(/);
  });

  it('nothing overflows at 360 px: the rail and legend wrap, grid children may shrink, long labels break', () => {
    expect(declared('.bg-map__rail', 'flex-wrap')).toEqual(['wrap']);
    expect(declared('.bg-map__legend', 'flex-wrap')).toEqual(['wrap']);
    expect(declared('.bg-map > *', 'min-width')).toEqual(['0']);
    for (const s of ['.bg-map__panel', '.bg-map__tip', '.bg-map__link']) expect(declared(s, 'overflow-wrap'), s).toEqual(['anywhere']);
    // No fixed width wider than a 360 px phone's content box anywhere.
    for (const m of CSS_SRC.matchAll(/(?:^|[;{\s])(min-width|width|flex-basis):\s*(\d+(?:\.\d+)?)(px|rem)/g)) {
      const px = Number(m[2]) * (m[3] === 'rem' ? 16 : 1);
      expect(px, m[0]).toBeLessThanOrEqual(320);
    }
    expect(CSS_SRC).not.toMatch(/white-space:\s*nowrap/);
    for (const s of ['.bg-map__chip', '.bg-map__walk', '.bg-map__btn']) expect(parseFloat(declared(s, 'min-height')[0]), s).toBeGreaterThanOrEqual(44);
  });

  it('eases bright and dim over 0.6 s, never under 0.5 s, and drops the transitions under reduced motion', () => {
    const times = [...CSS_SRC.matchAll(/(?:transition|animation)(?:-duration)?:\s*([^;}]+)/g)].map((m) => m[1]);
    expect(times.length).toBeGreaterThan(0);
    for (const v of times) {
      if (/^none/.test(v.trim())) continue;
      for (const t of v.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) expect(t[2] === 'ms' ? Number(t[1]) / 1000 : Number(t[1]), v).toBeGreaterThanOrEqual(0.5);
    }
    expect(declared('.bg-map__svg circle', 'transition')).toEqual(['fill 0.6s ease, r 0.6s ease, fill-opacity 0.6s ease']);
    expect(declared('.bg-map__svg line', 'transition')).toEqual(['stroke-opacity 0.6s ease']);
    const reduced = RULES.filter((r) => r.media === '(prefers-reduced-motion: reduce)');
    expect(reduced.some((r) => r.selector.includes('.bg-map__svg circle') && r.selector.includes('.bg-map__svg line') && /transition: none/.test(r.body))).toBe(true);
  });

  it('uses the site fonts only, and no font of its own', () => {
    expect(CSS_SRC).not.toMatch(/@font-face/);
    for (const m of CSS_SRC.matchAll(/font-family:\s*([^;}]+)/g)) expect(['inherit', 'var(--font)', 'var(--font-display)', 'var(--mono)']).toContain(m[1].trim());
  });
});

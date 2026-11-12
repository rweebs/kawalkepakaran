import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  slugify, nameKeys, isPlaceholder, computeMatches, buildGraph, visibleNodes, projectEdges, layout, neighbours, visibleAncestor, SECTORS,
  type GNode,
} from '../src/lib/relasi';
import type { WatchStore } from '../src/lib/sitemap-watch';
import type { Perkara, Terlapor } from '../src/lib/perkara';
import type { Fomo } from '../src/lib/fomo';

const json = <T,>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const u = { firstSeen: '2026-11-13', lastSeen: '2026-11-13', lastmod: null, images: 0 };
const SITE: WatchStore = {
  source: 'x', snapshots: [{ date: '2026-11-13', total: 6, images: 0, sections: {} }],
  urls: {
    '/': u, '/targets/': u, '/targets/budi-santoso/': u, '/targets/dinda-rhapsodya/': u,
    '/evidence/ev-20260101-001-rahmat-wibowo-menuduh-budi-santoso/': u, '/evidence/ev-20260102-001-akun-fomo-anonim/': u,
    '/evidence/ev-20260103-001-ani-wulan-dan-lainnya/': u,
  },
};
const tl = (o: Partial<Terlapor>): Terlapor => ({
  id: 'T-1', nama: 'X', kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: null, dugaan: '', pasal: [], pasalUraian: [],
  somasi: [], aduan: '-', laporan: [], kronologis: [], catatan: [], dokumen: [], ...o,
});
const PERKARA = {
  meta: {}, pasal: [], aduanBukanLp: [], kronologis: [], dokumen: [],
  terlapor: [
    tl({ id: 'T-1', nama: 'Budi Santoso ("Bud")', somasi: ['s1'], aduan: '1 (1 diajukan)' }),
    tl({ id: 'T-2', nama: 'Dinda Auchterin Rhapsodya', dugaan: 'akun @kakakmelihat menulis', klaster: 'Amazon/AWS; alumni ITB' }),
    tl({ id: 'T-3', nama: 'Ani Wulan Sari', kategori: 'C. Korporasi' }),
    tl({ id: 'T-4', nama: '[nama di lampiran] dan lainnya' }),
  ],
  laporan: [
    { no: 'LP-1', nomor: 'LP/1', stpl: 's', adaStpl: true, arah: 'oleh-pelapor', pelapor: 'Rahmat Wibowo', terlapor: ['T-1', 'L-50'], tanggal: null, dokumen: [] },
    { no: 'LP-2', nomor: 'LP/2', stpl: 's', adaStpl: false, arah: 'terhadap-pelapor', pelapor: 'Dinda', terlapor: ['T-2'], tanggal: null, dokumen: [] },
  ],
} as unknown as Perkara;
const FOMO = {
  meta: {},
  accounts: [
    { akun: 'KakakMelihat', perusahaan: 'Amazon', perluVerifikasi: false, nder: false, thread: [1] },
    { akun: 'DeletedUser', perusahaan: null, perluVerifikasi: false, nder: true, thread: [1] },
    { akun: 'awas', perusahaan: null, perluVerifikasi: false, nder: true, thread: [1] },
  ],
  posts: [
    { n: 1, akun: 'KakakMelihat', perusahaan: 'Amazon', nder: false, tanggal: null, iso: null, precision: 'none', teks: '', thread: 1 },
    { n: 2, akun: 'DeletedUser', perusahaan: null, nder: true, tanggal: null, iso: null, precision: 'none', teks: '', thread: 1 },
    { n: 3, akun: 'DeletedUser', perusahaan: null, nder: true, tanggal: null, iso: null, precision: 'none', teks: '', thread: 1 },
    { n: 4, akun: 'ceogenz', perusahaan: null, nder: false, tanggal: null, iso: null, precision: 'none', teks: '', thread: 1 },
  ],
  threads: [{ thread: 1, url: null, judul: 'Judul', pembuka: 'awas', posts: 4, akun: 3, mulai: null, akhir: null }],
} as unknown as Fomo;

describe('name keys and placeholders', () => {
  it('slugifies names and keeps plain aliases but not account notes', () => {
    expect(slugify('Pétra  Novandi-Barus!')).toBe('petra-novandi-barus');
    expect(nameKeys('Petra Novandi Barus (Petra Barus)')).toEqual(['petra-novandi-barus', 'petra-barus']);
    expect(nameKeys('Luca Cada Lora (akun X @lucaxyzz)')).toEqual(['luca-cada-lora']);
  });
  it('treats platform placeholders as groups, not people', () => {
    for (const n of ['DeletedUser', 'Deleted User', 'pengguna', '[deleted]']) expect(isPlaceholder(n)).toBe(true);
    expect(isPlaceholder('awas')).toBe(false);
  });
});

describe('computeMatches', () => {
  const m = computeMatches(SITE, PERKARA, FOMO);
  const of = (type: string) => m.filter((x) => x.type === type);
  it('matches targets/ slugs exactly (fact) and by first + last name (inference)', () => {
    expect(of('target-slug').map((x) => x.terlapor)).toEqual(['T-1']);
    expect(of('target-slug-fuzzy')).toMatchObject([{ terlapor: 'T-2', confidence: 'inference', other: 'targets/dinda-rhapsodya/' }]);
  });
  it('finds names in evidence slugs, full name as fact and first two words as inference', () => {
    expect(of('evidence-name')).toMatchObject([{ terlapor: 'T-1', confidence: 'fact', count: 1 }]);
    expect(of('evidence-name-partial')).toMatchObject([{ terlapor: 'T-3', confidence: 'inference' }]);
  });
  it('links a shared organisation and an identical handle only as inferences', () => {
    expect(of('organisation')).toMatchObject([{ terlapor: 'T-2', other: 'Amazon', confidence: 'inference' }]);
    expect(of('handle')).toMatchObject([{ terlapor: 'T-2', other: 'KakakMelihat', confidence: 'inference' }]);
  });
  it('records hostile pages about Fomo and never surfaces a lampiran-masked entry', () => {
    expect(of('site-mentions-fomo')).toMatchObject([{ count: 1, confidence: 'fact' }]);
    expect(m.some((x) => x.terlapor === 'T-4')).toBe(false);
  });
});

describe('buildGraph', () => {
  const m = computeMatches(SITE, PERKARA, FOMO);
  const g = buildGraph(SITE, PERKARA, FOMO, m);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const has = (from: string, to: string, kind: string) => g.edges.some((e) => e.from === from && e.to === to && e.kind === kind);
  it('puts the Pelapor at the centre with attacks in and responses out', () => {
    expect(byId.get('rw')?.kind).toBe('center');
    expect(has('site:evidence', 'rw', 'in-fact')).toBe(true);
    expect(has('tl:T-1', 'rw', 'in-allegation')).toBe(true);
    expect(has('rw', 'tl:T-1', 'out-response')).toBe(true);
    expect(has('rw', 'fomo', 'out-response')).toBe(true);
  });
  it('keeps reports against the Pelapor as their own edge kind, and never links Lampiran ids', () => {
    expect(has('lp:LP-2', 'rw', 'against')).toBe(true);
    expect(has('tl:T-2', 'lp:LP-2', 'against')).toBe(true);
    expect(has('rw', 'lp:LP-1', 'out-response')).toBe(true);
    expect(g.edges.some((e) => e.to.includes('L-50') || e.from.includes('L-50'))).toBe(false);
  });
  it('groups terlapor by kategori (A-E), not by raw klaster', () => {
    expect(g.nodes.filter((n) => n.source === 'perkara' && n.kind === 'cluster').map((n) => n.id)).toEqual(['pk:A', 'pk:C']);
  });
  it('puts placeholder accounts in one group without person nodes, posts counted on the group', () => {
    expect(byId.has('fa:DeletedUser')).toBe(false);
    expect(byId.get('fm:deleted')).toMatchObject({ label: 'akun terhapus', count: 1 });
    expect(g.edges.find((e) => e.from === 'fm:deleted' && e.to === 'rw')?.weight).toBe(2);
    expect(g.edges.find((e) => e.from === 'fm:anon' && e.to === 'rw')?.weight).toBe(1);
  });
  it('turns matches into cross edges with fact or inference style', () => {
    expect(has('tl:T-1', 'site:targets', 'cross-fact')).toBe(true);
    expect(has('tl:T-2', 'site:targets', 'cross-inference')).toBe(true);
    expect(has('site:evidence', 'fomo', 'cross-fact')).toBe(true);
  });
  it('projects member edges onto visible clusters and merges them', () => {
    const vis = visibleNodes(g.nodes, new Set());
    const ids = new Set(vis.map((n) => n.id));
    expect(vis.some((n) => n.kind === 'member')).toBe(false);
    expect(visibleAncestor('tl:T-1', byId, ids)).toBe('pk:A');
    const pe = projectEdges(g.edges, byId, ids);
    expect(pe.find((e) => e.from === 'pk:A' && e.to === 'rw' && e.kind === 'in-allegation')?.weight).toBe(3);
    expect(pe.some((e) => e.kind === 'structure')).toBe(false);
    expect(neighbours('pk:A', pe).some((x) => x.other === 'site:targets')).toBe(true);
  });
  it('lays nodes out deterministically inside the square, centre in the middle, each hub in its sector', () => {
    const vis = visibleNodes(g.nodes, new Set(['pk:A']));
    const a = layout(vis, 600);
    expect(layout(vis, 600)).toEqual(a);
    expect(a.find((n) => n.id === 'rw')).toMatchObject({ x: 300, y: 300 });
    for (const n of a) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThanOrEqual(600); expect(n.y).toBeGreaterThanOrEqual(0); expect(n.y).toBeLessThanOrEqual(600); }
    const site = a.find((n) => n.id === 'site')!;
    expect(Math.round((Math.atan2(site.y - 300, site.x - 300) * 180) / Math.PI)).toBe(SECTORS.site[0]);
    expect(a.some((n: GNode) => n.id === 'tl:T-1')).toBe(true);
  });
});

describe('real data', () => {
  const site = json<WatchStore>('src/data/sitemap-watch.json');
  const perkara = json<Perkara>('src/data/perkara.json');
  const fomo = json<Fomo>('src/data/fomo.json');
  const m = computeMatches(site, perkara, fomo);
  it('reproduces the 21 terlapor named on the hostile site\'s targets/ list', () => {
    expect(m.filter((x) => x.type === 'target-slug')).toHaveLength(21);
  });
  it('keeps DeletedUser out of matches and person nodes', () => {
    const g = buildGraph(site, perkara, fomo, m);
    expect(g.nodes.some((n) => n.id === 'fa:DeletedUser')).toBe(false);
    expect(m.some((x) => /deleteduser/i.test(x.other))).toBe(false);
  });
});

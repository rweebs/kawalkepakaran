import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  hero, yearsMonths, harmVsResponse, operatorFocus, harmOf, harmCategories, treemap, removals, imagesBySection, slugVsFirstSeen, archiveCoverage,
} from '../src/lib/pantau-page';
import { dataChangelog, lastCommitDay, redactionLedger, privacyChecks, sha256File, optionalJson } from '../src/lib/pantau-provenance';
import { ISLANDS, islandData, islandSrc } from '../src/lib/pantau-props';
import { classify, checkLinks } from '../scripts/check-fomo-links.mjs';
import type { Row, WatchSnapshot } from '../src/lib/sitemap-watch';
import type { Kronologi, Laporan, Terlapor } from '../src/lib/perkara';
import type { FomoPost } from '../src/lib/fomo';

const read = (p: string) => readFileSync(p, 'utf8');
const row = (path: string, over: Partial<Row> = {}): Row => ({
  path, group: 'evidence', section: path.split('/')[1] ?? '', idDate: null, lastmod: null, firstSeen: '2026-11-13', lastSeen: '2026-11-13', removed: false, images: 0, ...over,
});
const post = (iso: string | null): FomoPost => ({ n: 1, akun: 'a', perusahaan: null, nder: false, tanggal: null, iso, precision: iso ? 'day' : 'none', teks: '', thread: 1 });
const kr = (iso: string, jenis: string): Kronologi => ({ n: 1, tanggal: '', iso, precision: 'day', periode: '', jenis, terlapor: [], peristiwa: '', dokumen: [] });
const tl = (id: string, nama: string, pasal: string[] = []): Terlapor => ({
  id, nama, kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: null, dugaan: '', pasal, pasalUraian: [], somasi: [], aduan: '', laporan: [], kronologis: [], catatan: [], dokumen: [],
});
const lp = (arah: Laporan['arah']): Laporan => ({ no: 'LP', nomor: '', stpl: '', adaStpl: false, arah, pelapor: null, terlapor: [], tanggal: null, dokumen: [] });

const X = {
  site: [row('/evidence/ev-20231001-001-x/', { idDate: '2023-10-01' })],
  fomo: [post('2023-09-23'), post('2023-09-24'), post(null)],
  kronologis: [kr('2026-04-13', 'Somasi'), kr('2026-04-20', 'Aduan'), kr('2023-10-05', 'Perbuatan')],
  laporan: [lp('oleh-pelapor'), lp('oleh-pelapor'), lp('terhadap-pelapor')],
  terlapor: [tl('T-1', 'Budi Santoso')],
};

describe('hero and duration', () => {
  it('counts each source in its own unit and dates the first harm', () => {
    const h = hero({ ...X, siteTotal: 829, fomoThreads: 34 }, '2026-11-13');
    expect(h).toMatchObject({ siteUrls: 829, fomoPosts: 3, fomoThreads: 34, terlapor: 1, reportsOwn: 2, reportsAgainst: 1, firstHarm: '2023-09-23', firstFomo: '2023-09-23' });
    expect(h.daysTargeted).toBe(1147);
    expect(yearsMonths(1147)).toEqual({ years: 3, months: 1 });
  });
});

describe('harm vs response', () => {
  it('puts harm and response on one month axis and finds waves of at least 20 items', () => {
    const many = Array.from({ length: 25 }, () => post('2023-10-02'));
    const r = harmVsResponse({ ...X, fomo: [...X.fomo, ...many] })!;
    expect(r.months[0]).toBe('2023-09');
    expect(r.months.at(-1)).toBe('2026-04');
    expect(r.harm[1]).toBe(27);
    expect(r.response.at(-1)).toBe(2);
    expect(r.waves).toEqual([{ from: '2023-09', to: '2023-10', harm: 29, response: 0 }]);
  });
});

describe('operator focus and harm categories', () => {
  it('counts evidence slugs that contain a full two-word name, never a single first name', () => {
    const site = [row('/evidence/ev-1-rahmat-wibowo-budi-santoso-x/'), row('/evidence/ev-2-budi-santoso/'), row('/evidence/ev-3-budi-x/')];
    expect(operatorFocus(site, [tl('T-1', 'Budi Santoso'), tl('T-2', 'Budi')])).toEqual([{ id: 'T-1', nama: 'Budi Santoso', evidence: 2 }]);
  });
  it('groups mapped articles into harms and skips general provisions', () => {
    expect([harmOf('433 KUHP'), harmOf('434 KUHP'), harmOf('27A ITE'), harmOf('29 ITE'), harmOf('20 KUHP'), harmOf('67 UU No. 27 Tahun 2022 (Pelindungan Data Pribadi)')])
      .toEqual(['pencemaran', 'fitnah', 'pencemaran', 'ancaman', null, 'data']);
    expect(harmCategories([tl('T-1', 'A', ['433 KUHP', '27A ITE', '3 KUHP']), tl('T-2', 'B', ['434 KUHP', '433 KUHP'])]))
      .toEqual([{ harm: 'pencemaran', terlapor: 2, pasal: ['27A ITE', '433 KUHP'] }, { harm: 'fitnah', terlapor: 1, pasal: ['434 KUHP'] }]);
  });
  it('lays out a treemap that fills the box exactly', () => {
    const tiles = treemap([{ key: 'a', value: 6 }, { key: 'b', value: 3 }, { key: 'c', value: 1 }, { key: 'z', value: 0 }], 100, 50);
    expect(tiles.map((t) => t.key)).toEqual(['a', 'b', 'c']);
    expect(tiles.reduce((s, t) => s + t.w * t.h, 0)).toBeCloseTo(5000);
    for (const t of tiles) { expect(t.x + t.w).toBeLessThanOrEqual(100.0001); expect(t.y + t.h).toBeLessThanOrEqual(50.0001); }
  });
});

describe('site evidence views', () => {
  it('groups removals by last snapshot, counts images per section', () => {
    const rows = [row('/a/', { removed: true, lastSeen: '2026-11-13' }), row('/b/', { removed: true, lastSeen: '2026-11-13' }), row('/evidence/x/', { images: 3 }), row('/targets/y/', { images: 1 })];
    expect(removals(rows)).toEqual([{ lastSeen: '2026-11-13', paths: ['/a/', '/b/'] }]);
    expect(imagesBySection(rows)).toEqual([{ section: 'evidence', images: 3, urls: 1 }, { section: 'targets', images: 1, urls: 1 }]);
  });
  it('measures slug-date lag only for URLs first seen after the first snapshot', () => {
    const rows = [row('/e/1/', { idDate: '2026-01-01' }), row('/e/2/', { idDate: '2026-11-20', firstSeen: '2026-11-25' }), row('/e/3/', { idDate: '2026-09-01', firstSeen: '2026-11-25' })];
    const g = slugVsFirstSeen(rows, '2026-11-13');
    expect([g.baseline, g.afterBaseline, g.medianAfter]).toEqual([1, 2, 45]);
    expect(g.buckets.find((b) => b.label === '0–7')!.n).toBe(1);
    expect(g.buckets.find((b) => b.label === '31–90')!.n).toBe(1);
  });
  it('counts archive coverage only from recorded Save Page Now results', () => {
    const s = (date: string, wayback?: { url: string; status?: number; error?: string }[]): WatchSnapshot =>
      ({ date, total: 1, images: 0, sections: {}, provenance: { fetchedAt: '', status: 200, finalUrl: '', bytes: 1, sha256: 'x', ...(wayback ? { wayback } : {}) } });
    expect(archiveCoverage([s('2026-11-13')], 829)).toEqual({ submitted: 0, failed: 0, runs: 0, lastRun: null, listed: 829 });
    expect(archiveCoverage([s('2026-11-13'), s('2026-11-20', [{ url: 'a', status: 200 }, { url: 'b', error: 'timeout' }])], 829))
      .toEqual({ submitted: 1, failed: 1, runs: 1, lastRun: '2026-11-20', listed: 829 });
  });
});

describe('provenance, changelog and redaction', () => {
  it('parses git log into a changelog, and is empty (not invented) when git has nothing', () => {
    const git = () => '@@abc1234|2026-11-14|data: add Fomo\nsrc/data/fomo.json\n\n@@def5678|2026-11-13|first\nsrc/data/perkara.json\nREADME.md\n';
    expect(dataChangelog(git, ['src/data/fomo.json', 'src/data/perkara.json'])).toEqual([
      { hash: 'abc1234', date: '2026-11-14', subject: 'data: add Fomo', files: ['src/data/fomo.json'] },
      { hash: 'def5678', date: '2026-11-13', subject: 'first', files: ['src/data/perkara.json'] },
    ]);
    expect(dataChangelog(() => '', ['x'])).toEqual([]);
    expect(dataChangelog(() => { throw new Error('no git'); }, ['x'])).toEqual([]);
    expect(lastCommitDay(() => '', 'x')).toBeNull();
  });
  it('counts redactions from the published text and passes every privacy check on the shipped data', () => {
    const perkaraText = read('src/data/perkara.json');
    const fomoText = read('src/data/fomo.json');
    const r = redactionLedger(perkaraText, fomoText, { terlapor_lampiran_a: 81, lampiranC: 18 });
    expect(r.maskedNames).toBeGreaterThan(0);
    expect(r.maskedAddresses).toBeGreaterThan(0);
    expect(privacyChecks(perkaraText, fomoText).filter((c) => !c.ok)).toEqual([]);
    expect(privacyChecks('{"Domisili / afiliasi":"x","t":"di Jl. Mawar 3"}', '"source/1/a.png"').filter((c) => !c.ok).map((c) => c.id)).toEqual(['domisili', 'alamat', 'berkas']);
  });
  it('hashes files and treats missing optional logs as absent', () => {
    expect(sha256File('src/data/fomo.json')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256File('src/data/does-not-exist.json')).toBeNull();
    expect(optionalJson('src/data/does-not-exist.json')).toBeNull();
  });
});

describe('fomo link checker', () => {
  it('classifies responses without guessing', () => {
    expect([classify(200), classify(404), classify(410), classify(403), classify(200, 'https://fomo.id/login'), classify(500)]).toEqual(['live', 'gone', 'gone', 'login', 'login', 'error']);
  });
  it('records an error, not a status, when the request fails', async () => {
    const fetchImpl = (async (u: string) => { if (u.endsWith('2')) throw new Error('x'); return new Response('', { status: 404 }); }) as unknown as typeof fetch;
    const out = await checkLinks(['https://f/1', 'https://f/2'], { fetchImpl, now: () => new Date('2026-11-13T00:00:00Z'), sleep: async () => {} });
    expect(out.map((o: { status: string }) => o.status)).toEqual(['gone', 'error']);
  });
});

describe('page wiring', () => {
  const page = read('src/pages/pantau.astro');
  it('serves each island its data as JSON instead of inline props', () => {
    for (const name of ISLANDS) expect(Object.keys(islandData(name)).length).toBeGreaterThan(0);
    expect(islandSrc('fomo')).toBe('/pantau-data/fomo.json');
    expect(existsSync('src/pages/pantau-data/[name].json.ts')).toBe(true);
    expect(page).not.toMatch(/<(RelasiGraph|SitemapDashboard|PerkaraDashboard|FomoDashboard) client:/);
    expect(page.match(/<PantauLazy client:visible/g)).toHaveLength(4);
  });
  it('leads with the hero, orders chapters by when the harm happened, and stamps provenance on all three sections', () => {
    expect(page.indexOf('<PantauHero')).toBeLessThan(page.indexOf('id="relasi"'));
    expect(page.indexOf('id="fomo"')).toBeLessThan(page.indexOf('id="situs"'));
    expect(page.indexOf('id="situs"')).toBeLessThan(page.indexOf('id="gelar-perkara"'));
    expect(page.match(/<ProvenanceStrip /g)).toHaveLength(3);
    expect(page).toContain("import '../styles/pantau-page.css'");
  });
});

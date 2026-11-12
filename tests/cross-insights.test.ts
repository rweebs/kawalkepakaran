import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  median, gini, hhi, topShare, pct, weekdays, waves, monthRange, slugify, daysBetween,
  streamDates, monthly, attackWaves, counterAttack, overlaps, crossSummary, mirroredReports, type CrossInput,
} from '../src/lib/cross-insights';
import type { Row } from '../src/lib/sitemap-watch';
import type { FomoPost } from '../src/lib/fomo';
import type { Kronologi, Laporan, Terlapor } from '../src/lib/perkara';

describe('statistics', () => {
  it('median, gini, hhi, topShare, pct', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([0, 0, 0, 10])).toBe(0.75);
    expect(gini([1])).toBeNull();
    expect(hhi([10])).toBe(10000);
    expect(hhi([1, 1, 1, 1])).toBe(2500);
    expect(topShare([5, 3, 2], 1)).toBe(50);
    expect(pct(1, 3)).toBe(33);
    expect(pct(1, 0)).toBe(0);
  });
  it('weekdays count Monday first and skip non-day dates', () => {
    // 2026-11-09 is a Monday, 2026-11-15 a Sunday.
    expect(weekdays(['2026-11-09', '2026-11-15', '2026-11', '2026-11-09'])).toEqual([2, 0, 0, 0, 0, 0, 1]);
  });
  it('splits dates into waves by gap and drops small ones', () => {
    const ds = ['2023-10-01', '2023-10-02', '2023-10-02', '2023-10-20', '2024-06-01', '2026-05-01', '2026-05-01', '2026-05-03'];
    const w = waves(ds, 45, 3);
    expect(w.map((x) => [x.from, x.to, x.count])).toEqual([['2023-10-01', '2023-10-20', 4], ['2026-05-01', '2026-05-03', 3]]);
    expect(w[0].peak).toEqual({ date: '2023-10-02', count: 2 });
  });
  it('month ranges, day gaps and slugs', () => {
    expect(monthRange('2025-11-30', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(slugify('Petra Novandi Barus (Petra Barus)')).toBe('petra-novandi-barus');
    expect(slugify('Ábigail  Aryaputra-Sudarman')).toBe('abigail-aryaputra-sudarman');
  });
});

const row = (path: string, idDate: string | null, section = path.split('/')[1]): Row =>
  ({ path, group: section === 'targets' ? 'targets' : 'evidence', section, idDate, lastmod: null, firstSeen: '2026-11-13', lastSeen: '2026-11-13', removed: false, images: 0 });
const post = (n: number, iso: string | null, akun = `a${n}`): FomoPost => ({ n, akun, perusahaan: null, nder: false, tanggal: null, iso, precision: iso ? 'day' : 'none', teks: '', thread: 1 });
const kr = (n: number, iso: string | null, jenis: string, peristiwa = ''): Kronologi => ({ n, tanggal: '', iso, precision: iso ? 'day' : 'none', periode: '', jenis, terlapor: [], peristiwa, dokumen: [] });
const tl = (id: string, nama: string, dugaan = ''): Terlapor => ({ id, nama, kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: null, dugaan, pasal: [], pasalUraian: [], somasi: [], aduan: '', laporan: [], kronologis: [], catatan: [], dokumen: [] });
const lp = (no: string, arah: Laporan['arah'], tanggal: string | null): Laporan => ({ no, nomor: no, stpl: '', adaStpl: false, arah, pelapor: null, terlapor: [], tanggal, dokumen: [] });

const X: CrossInput = {
  site: [row('/evidence/ev-20260501-001/', '2026-05-01'), row('/evidence/ev-20260502-001/', '2026-05-02'), row('/targets/budi-santoso/', null), row('/targets/ani/', null)],
  fomo: [post(1, '2023-10-01'), post(2, '2023-10-02'), post(3, '2023-10-02'), post(4, '2026-05-01'), post(5, null)],
  kronologis: [kr(1, '2023-10-03', 'Perbuatan', 'unggahan akun @fomoakun'), kr(2, '2026-05-10', 'Somasi'), kr(3, '2026-05-11', 'Aduan'), kr(4, '2026-05-12', 'Somasi'), kr(5, '2026-05-20', 'Tanggapan')],
  laporan: [lp('LP-1', 'oleh-pelapor', '2026-07-28'), lp('LP-2', 'terhadap-pelapor', '2026-07-05'), lp('LP-3', 'oleh-pelapor', null), lp('LP-4', 'terhadap-pelapor', '2026-09-01')],
  terlapor: [tl('T-1', 'Budi Santoso'), tl('T-2', 'Ani Wijaya'), tl('T-3', 'Cici', 'unggahan')],
};

describe('cross layer', () => {
  const d = streamDates(X);
  it('splits the three attack streams from Rahmat\'s own legal steps', () => {
    expect(d.situs).toEqual(['2026-05-01', '2026-05-02']);
    expect(d.fomo).toHaveLength(4);
    expect(d.perbuatan).toEqual(['2023-10-03']);
    expect(d.respons).toEqual(['2026-05-10', '2026-05-11', '2026-05-12']);
  });
  it('puts every stream on one month axis', () => {
    const m = monthly(d)!;
    expect(m.months[0]).toBe('2023-10');
    expect(m.months.at(-1)).toBe('2026-05');
    expect(m.series.fomo[0]).toBe(3);
    expect(m.series.respons.at(-1)).toBe(3);
  });
  it('finds attack waves and the first legal step after each', () => {
    const w = attackWaves(d, 45, 3);
    expect(w.map((x) => [x.wave.from, x.wave.count, x.firstResponse, x.lagDays])).toEqual([['2023-10-01', 4, '2026-05-10', 952], ['2026-05-01', 3, '2026-05-10', 9]]);
    expect(w[0].bySource).toMatchObject({ fomo: 3, perbuatan: 1, situs: 0 });
  });
  it('counts content before and after clusters of legal steps', () => {
    const c = counterAttack(d)!;
    expect(c.clusters).toBe(1);
    expect(c.before).toBe(3);
    expect(c.after).toBe(0);
    expect(c.followedByMore).toBe(0);
    expect(c.medianLag).toBeNull();
  });
  it('matches terlapor to /targets/ pages by exact slug only, and Fomo names only as explicit account references', () => {
    const o = overlaps({ ...X, fomo: [...X.fomo, post(9, '2023-10-01', 'fomoakun'), post(10, '2023-10-01', 'unggahan')] });
    expect(o.terlapor.map((t) => t.id)).toEqual(['T-1']);
    expect(o.fomoInPerkara).toEqual(['fomoakun']);
  });
  it('summarises span, shares, responses and escalation', () => {
    const s = crossSummary(X, d);
    expect(s.attackTotal).toBe(7);
    expect(s.span).toEqual({ from: '2023-10-01', to: '2026-05-02', days: 944 });
    expect(s.share).toEqual({ situs: 29, fomo: 57, perbuatan: 14 });
    expect(s.responses).toEqual({ somasi: 2, aduan: 1, laporan: 2, laporanTerhadap: 2 });
  });
  it('mirrors Rahmat\'s reports against the reports filed against him, keeping undated ones counted', () => {
    const m = mirroredReports(X.laporan);
    expect(m).toMatchObject({ own: 2, ownDated: 1, against: 2, againstDated: 2, firstOwn: '2026-07-28', firstAgainst: '2026-07-05' });
    expect(m.months).toEqual([{ key: '2026-07', own: 1, against: 1 }, { key: '2026-08', own: 0, against: 0 }, { key: '2026-09', own: 0, against: 1 }]);
  });
});

describe('cross panel wiring', () => {
  it('renders at build time without shipping data, and labels inferences', () => {
    const c = readFileSync('src/components/CrossInsights.tsx', 'utf8');
    expect(c).not.toMatch(/useState|useEffect/);
    expect(c).toContain("kind: 'inference'");
    expect(c).toContain('Rahmat Wibowo menjadi sasaran');
  });
});

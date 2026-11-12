import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stageItems, dayOf, timeScale, layout, countUpTo, yearMarks, hash, SECTOR, HEIGHT, KINDS, type StageItem } from '../src/lib/pantau-3d';
import { stageProps } from '../src/lib/pantau-props';

const read = (p: string) => readFileSync(p, 'utf8');

describe('pantau 3D stage data', () => {
  const input = {
    site: [{ path: '/evidence/ev-20260607-001-x/', idDate: '2026-06-07', section: 'evidence' }, { path: '/targets/a/', idDate: null, section: 'targets' }],
    fomo: [{ iso: '2023-09-23', akun: 'ajakebonawi', perusahaan: null, teks: 'isi', thread: 1 }, { iso: '2026-05-06', akun: 'DeletedUser', perusahaan: null, teks: 'x', thread: 2 }, { iso: null, akun: 'b', perusahaan: 'DANA', teks: 'y', thread: 2 }],
    kronologis: [
      { iso: '2023-10', precision: 'month', jenis: 'Perbuatan', terlapor: ['T-001'], peristiwa: 'unggahan' },
      { iso: '2026-04-13', precision: 'day', jenis: 'Somasi', terlapor: ['T-001'], peristiwa: 'somasi' },
      { iso: '2025', precision: 'year', jenis: 'Aduan', terlapor: [], peristiwa: 'tahun saja' },
      { iso: '2026-05-01', precision: 'day', jenis: 'Tanggapan', terlapor: [], peristiwa: 'tanggapan' },
    ],
    laporan: [
      { no: 'LP-01', nomor: 'LP/B/1', tanggal: '2026-07-05', arah: 'terhadap-pelapor', pelapor: 'X', terlapor: [] },
      { no: 'LP-02', nomor: 'LP/B/2', tanggal: '2026-07-28', arah: 'oleh-pelapor', pelapor: 'Rahmat Wibowo', terlapor: ['T-001'] },
      { no: 'LP-03', nomor: 'LP/B/3', tanggal: null, arah: 'oleh-pelapor', pelapor: 'Rahmat Wibowo', terlapor: [] },
    ],
    terlaporNames: { 'T-001': 'Budi' },
    siteOrigin: 'https://rahmatwibowo.net',
  };
  const items = stageItems(input);

  it('keeps only dated items, classifies them, and sorts oldest first', () => {
    expect(items.map((i) => [i.k, i.d])).toEqual([
      ['fomo', '2023-09-23'], ['act', '2023-10-15'], ['resp', '2026-04-13'], ['fomo', '2026-05-06'],
      ['site', '2026-06-07'], ['against', '2026-07-05'], ['resp', '2026-07-28'],
    ]);
    expect(items.find((i) => i.k === 'act')?.t).toBe('Budi');
    expect(items.find((i) => i.k === 'site')?.href).toBe('https://rahmatwibowo.net/evidence/ev-20260607-001-x/');
    expect(items.find((i) => i.t === 'DeletedUser')?.g).toBe('akun terhapus');
  });
  it('places month-only dates mid-month and drops year-only ones', () => {
    expect([dayOf('2023-10', 'month'), dayOf('2025', 'year'), dayOf(null), dayOf('2026-01-02')]).toEqual(['2023-10-15', null, null, '2026-01-02']);
  });
  it('maps time monotonically into [0,1] and shrinks empty stretches', () => {
    const days = ['2023-09-01', '2023-09-02', '2026-01-01', '2026-01-02'];
    const y = timeScale(days);
    const v = days.map(y);
    expect(v[0]).toBe(0);
    expect(v[3]).toBe(1);
    for (let n = 1; n < v.length; n++) expect(v[n]).toBeGreaterThanOrEqual(v[n - 1]);
    // Linear time would put 2023-09-02 at ~0.001; rank lifts it so a wave keeps readable height.
    expect(v[1]).toBeGreaterThan(0.15);
  });
  it('lays items out in their sector and within the spine height', () => {
    const pos = layout(items);
    items.forEach((it, n) => {
      const [x, y, z] = [pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]];
      const r = Math.hypot(x, z);
      expect(Math.abs(r - SECTOR[it.k].r)).toBeLessThanOrEqual(0.81);
      expect(Math.abs(y)).toBeLessThanOrEqual(HEIGHT / 2 + 1e-6);
    });
    expect(layout(items)).toEqual(pos);
  });
  it('counts items up to a day for the time slider, and marks each year', () => {
    expect(countUpTo(items, '2023-12-31')).toBe(2);
    expect(countUpTo(items, '2026-12-31')).toBe(items.length);
    expect(yearMarks(items).map((m) => m.year)).toEqual(['2023', '2024', '2025', '2026']);
    expect(hash('a')).toBe(hash('a'));
  });
});

describe('fullscreen 3D wiring', () => {
  it('ships every dated item of the real data, all five kinds', () => {
    const { items } = stageProps();
    expect(items.length).toBeGreaterThan(1400);
    for (const k of KINDS) expect(items.some((i: StageItem) => i.k === k), k).toBe(true);
    expect(items.filter((i: StageItem) => i.k === 'against')).toHaveLength(4);
  });
  it('loads three.js only on open: no static three import in the page or the button', () => {
    const btn = read('src/components/PantauFullscreen.tsx');
    expect(btn).not.toMatch(/^import .*['"]three/m);
    expect(btn).toContain("import('../lib/pantau-scene')");
    expect(btn).toMatch(/import type \{ StageScene \}/);
    expect(read('src/pages/pantau.astro')).toContain('<PantauFullscreen client:idle');
    expect(read('src/lib/pantau-scene.ts')).toContain("from 'three'");
  });
  it('keeps the allegation label and nofollow on outbound links in the detail panel', () => {
    const btn = read('src/components/PantauFullscreen.tsx');
    expect(btn).toContain('bukan temuan polisi');
    expect(btn).toContain('rel="nofollow ugc noopener noreferrer"');
  });
});

import { describe, it, expect } from 'vitest';
import { journeyProps, relasiProps } from '../src/lib/pantau-props';
import { buildJourney, chapterAt, walkStops, periodsFor, periodAt, dayNumber } from '../src/lib/relasi-journey';
import type { GNode } from '../src/lib/relasi';
import type { StageInput } from '../src/lib/pantau-3d';

const n = (id: string, parent?: string): GNode => ({ id, kind: 'member', source: 'perkara', label: id, count: 1, parent });
const INPUT: StageInput = {
  site: [{ path: '/evidence/ev-1/', idDate: '2024-03-10', section: 'evidence' }],
  fomo: [{ iso: '2023-09-23', akun: 'budi', perusahaan: null, teks: 'halo', thread: 1 }],
  kronologis: [
    { iso: '2023-10', precision: 'month', jenis: 'Perbuatan', terlapor: ['T-1'], peristiwa: 'x' },
    { iso: '2026-04-13', precision: 'day', jenis: 'Somasi', terlapor: ['T-1'], peristiwa: 'y' },
    { iso: '2023', precision: 'year', jenis: 'Perbuatan', terlapor: ['T-1'], peristiwa: 'tanpa hari' },
  ],
  laporan: [{ no: 'LP-01', nomor: 'LP/1', tanggal: '2026-09-22', arah: 'terhadap-pelapor', pelapor: 'A', terlapor: ['T-1'] }],
  terlaporNames: { 'T-1': 'Terlapor Satu' }, siteOrigin: 'https://x.test',
};
const NODES = [n('rw'), n('site:evidence'), n('fa:budi'), n('ft:1'), n('tl:T-1'), n('lp:LP-01')];

describe('buildJourney', () => {
  const j = buildJourney(INPUT, NODES);
  it('orders events by day and skips year-only dates', () => {
    expect(j.events.map((e) => e.d)).toEqual(['2023-09-23', '2023-10-15', '2024-03-10', '2026-04-13', '2026-09-22']);
    expect(j.start).toBe('2023-09-23');
    expect(j.end).toBe('2026-09-22');
  });
  it('dates each node by its first event and the Pelapor from the start', () => {
    expect(j.nodeDay['fa:budi']).toBe('2023-09-23');
    expect(j.nodeDay['tl:T-1']).toBe('2023-10-15');
    expect(j.nodeDay['lp:LP-01']).toBe('2026-09-22');
    expect(j.nodeDay.rw).toBe('2023-09-23');
  });
  it('groups into half-year rooms that cover every event once', () => {
    expect(j.chapters.map((c) => [c.from, c.to])).toEqual([['2023-09-23', '2023-10-15'], ['2024-03-10', '2024-03-10'], ['2026-04-13', '2026-04-13'], ['2026-09-22', '2026-09-22']]);
    expect(j.chapters.reduce((s, c) => s + c.last - c.first + 1, 0)).toBe(j.events.length);
    expect(j.chapters[0].newTerlapor).toBe(1);
    expect(j.chapters[0].newAkun).toBe(1);
  });
  it('finds the room of a day and lists the walk oldest first', () => {
    expect(chapterAt(j, '2024-05-01')).toBe(1);
    expect(chapterAt(j, '2020-01-01')).toBe(0);
    const w = walkStops(j);
    expect([...w].sort((a, b) => a - b)).toEqual(w);
  });
  it('cuts the same events into months and days', () => {
    const months = periodsFor(j, 'month');
    expect(months.map((c) => c.from.slice(0, 7))).toEqual(['2023-09', '2023-10', '2024-03', '2026-04', '2026-09']);
    expect(months.reduce((s, c) => s + c.last - c.first + 1, 0)).toBe(j.events.length);
    const days = periodsFor(j, 'day');
    expect(days).toHaveLength(5);
    expect(days[1].from).toBe('2023-10-15');
    expect(periodAt(months, '2023-10-31', 'month')?.from).toBe('2023-10-15');
    expect(periodAt(months, '2025-01-01', 'month')).toBeNull();
    expect(periodAt(days, '2023-10-16', 'day')).toBeNull();
    expect(periodAt(j.chapters, '2025-01-01', 'room')?.from).toBe('2024-03-10');
  });
  it('walks one stop per month or day, the most serious event first', () => {
    const days = periodsFor(j, 'day');
    const w = walkStops(j, days, 'day');
    expect(w).toHaveLength(days.length);
    expect(j.events[w[4]].k).toBe('against');
    expect(walkStops(j, periodsFor(j, 'month'), 'month')).toHaveLength(5);
  });
  it('copes with no dated events', () => {
    expect(buildJourney({ ...INPUT, site: [], fomo: [], kronologis: [], laporan: [] }, NODES).chapters).toEqual([]);
  });
});

describe('real journey', () => {
  const j = journeyProps();
  const ids = new Set(relasiProps().nodes.map((x) => x.id));
  it('only points at nodes of the graph and covers the whole span', () => {
    expect(j.events.length).toBeGreaterThan(500);
    for (const e of j.events) for (const id of e.nodes) expect(ids.has(id)).toBe(true);
    expect(dayNumber(j.end)).toBeGreaterThan(dayNumber(j.start));
    expect(j.chapters.length).toBeGreaterThanOrEqual(5);
    expect(j.chapters.every((c) => c.highlights.length > 0)).toBe(true);
  });
  it('stays small enough to ship', () => {
    expect(JSON.stringify(j).length).toBeLessThan(450_000);
  });
});

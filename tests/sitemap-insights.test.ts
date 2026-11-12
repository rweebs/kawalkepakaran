import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  velocity, cadence, sequenceGaps, offsetOf, offsetBreakdown, eventWindows, eventSummary, slugTerms, risingTerms, bulkResets, addDays,
} from '../src/lib/sitemap-insights';
import { toRows, type Row, type WatchStore } from '../src/lib/sitemap-watch';

const row = (path: string, idDate: string | null, lastmod: string | null = null): Row => ({
  path, idDate, lastmod, group: path.startsWith('/targets') ? 'targets' : path.startsWith('/documents') ? 'documents' : 'evidence',
  section: path.split('/')[1], firstSeen: '2026-11-13', lastSeen: '2026-11-13', removed: false, images: 0,
});

describe('velocity', () => {
  it('compares the last 30 days with the 30 before, per week and in percent', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row(`/evidence/ev-x-${i}/`, '2026-11-10')),
      ...Array.from({ length: 3 }, (_, i) => row(`/evidence/ev-y-${i}/`, '2026-10-01')),
      row('/evidence/old/', '2026-08-01'),
    ];
    expect(velocity(rows, '2026-11-13')).toEqual({ current: 6, prior: 3, perWeek: 1.4, changePct: 100, from: '2026-10-15', to: '2026-11-13' });
  });
  it('has no percent without a prior period, and nothing without data', () => {
    expect(velocity([row('/e/a/', '2026-11-13')], '2026-11-13')?.changePct).toBeNull();
    expect(velocity([row('/targets/a/', null)], '2026-11-13')).toBeNull();
  });
});

describe('cadence', () => {
  it('finds the busiest slug date and the longest run of consecutive days', () => {
    const c = cadence([row('/e/1/', '2026-11-01'), row('/e/2/', '2026-11-02'), row('/e/3/', '2026-11-02'), row('/e/4/', '2026-11-03'), row('/e/5/', '2026-11-07')])!;
    expect(c.busiest).toEqual({ date: '2026-11-02', count: 2 });
    expect(c.streak).toEqual({ from: '2026-11-01', to: '2026-11-03', days: 3 });
    expect(c.activeDays).toBe(4);
    expect(cadence([])).toBeNull();
  });
  it('steps across month ends', () => expect(addDays('2026-10-31', 1)).toBe('2026-11-01'));
});

describe('sequenceGaps', () => {
  const all = [
    row('/evidence/ev-20261112-001-a/', '2026-11-12'), row('/evidence/ev-20261112-002-b/', '2026-11-12'),
    row('/evidence/ev-20261112-005-c/', '2026-11-12'), row('/documents/doc-20261111-002/', '2026-11-11'),
    row('/evidence/ev-20261110-001-d/', '2026-11-10'),
  ];
  it('lists numbers below each series maximum that the sitemap does not have', () => {
    const g = sequenceGaps(all)!;
    expect(g.gaps).toEqual([
      { prefix: 'ev', date: '2026-11-12', missing: [3, 4], max: 5 },
      { prefix: 'doc', date: '2026-11-11', missing: [1], max: 2 },
    ]);
    expect(g.totalMissing).toBe(3);
    expect(g.series).toBe(3);
  });
  it('never invents a gap from a text filter: gaps come from all rows, the scope only picks series', () => {
    const scoped = sequenceGaps(all, [all[0]])!;
    expect(scoped.gaps.map((x) => x.missing)).toEqual([[3, 4]]);
  });
  it('is null without numbered slugs', () => expect(sequenceGaps([row('/targets/a/', null)])).toBeNull());
});

describe('offsets', () => {
  it('reads the offset of a stamp, Z as +00:00', () => {
    expect(offsetOf('2026-11-11T14:41:22+07:00')).toBe('+07:00');
    expect(offsetOf('2026-11-11T07:41:22Z')).toBe('+00:00');
    expect(offsetOf('2026-11-11')).toBeNull();
    expect(offsetOf(null)).toBeNull();
  });
  it('counts offsets, most common first', () => {
    expect(offsetBreakdown(['+07:00', '+00:00', '+07:00', null, '+08:00'])).toEqual([
      { offset: '+07:00', count: 2 }, { offset: '+00:00', count: 1 }, { offset: '+08:00', count: 1 },
    ]);
  });
});

describe('events', () => {
  const rows = [row('/e/1/', '2026-10-01'), row('/e/2/', '2026-10-05'), row('/e/3/', '2026-10-06'), row('/e/4/', '2026-10-12'), row('/e/5/', '2026-10-30')];
  it('counts dated items in the 7 days before, on, and after each event, dropping silent events', () => {
    const w = eventWindows(rows, [{ date: '2026-10-05', title: 'A' }, { date: '2026-06-01', title: 'quiet' }]);
    expect(w).toEqual([{ event: { date: '2026-10-05', title: 'A' }, before: 1, sameDay: 1, after: 2 }]);
  });
  it('summarises how many events were followed by more or fewer items', () => {
    const s = eventSummary(eventWindows(rows, [{ date: '2026-10-05', title: 'A' }, { date: '2026-10-13', title: 'B' }]))!;
    expect([s.events, s.rose, s.fell, s.flat]).toEqual([2, 1, 1, 0]);
    expect(s.top[0].event.title).toBe('A');
    expect(eventSummary([])).toBeNull();
  });
});

describe('terms', () => {
  it('drops stopwords, the subject name, numbers and short fragments', () => {
    expect(slugTerms('/evidence/ev-20261112-001-rahmat-wibowo-phantom-ceo-kevingoly/')).toEqual(['phantom', 'ceo', 'kevingoly']);
    expect(slugTerms('/evidence/ev-20261111-012-rahmat-wibowo-abil-somasi-virtual-office/')).toEqual(['abil', 'somasi', 'virtual', 'office']);
  });
  it('ranks terms by their rise in share against the earlier period', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(`/evidence/ev-2026111${i}-00${i}-somasi-x${i}/`, `2026-11-1${i}`)),
      ...Array.from({ length: 4 }, (_, i) => row(`/evidence/ev-2026060${i + 1}-00${i}-linkedin-y${i}/`, `2026-06-0${i + 1}`)),
      row('/evidence/ev-20261112-009-linkedin-z/', '2026-11-12'),
    ];
    const r = risingTerms(rows, '2026-11-13', 30, 8, 2);
    expect(r[0]).toEqual({ term: 'somasi', recent: 4, earlier: 0 });
    expect(r.find((x) => x.term === 'linkedin')).toBeUndefined();
  });
});

describe('bulkResets', () => {
  it('flags lastmod days that more than 20% of rows share', () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => row(`/e/a${i}/`, null, '2026-10-17')),
      ...Array.from({ length: 15 }, (_, i) => row(`/e/b${i}/`, null, `2026-09-${String(i + 1).padStart(2, '0')}`)),
    ];
    expect(bulkResets(rows)).toEqual([{ date: '2026-10-17', count: 15, share: 50 }]);
    expect(bulkResets(rows.slice(0, 10))).toEqual([]);
  });
});

describe('insights on the recorded store', () => {
  it('produces every insight from the real snapshot', () => {
    const store = JSON.parse(readFileSync('src/data/sitemap-watch.json', 'utf8')) as WatchStore;
    const rows = toRows(store);
    const end = store.snapshots.at(-1)!.date;
    const v = velocity(rows, end);
    const g = sequenceGaps(rows);
    const o = offsetBreakdown(Object.values(store.urls).map((u) => offsetOf(u.lastmod)));
    console.log(JSON.stringify({ v, c: cadence(rows), gaps: g && { ...g, gaps: g.gaps.slice(0, 5) }, o, terms: risingTerms(rows, end), resets: bulkResets(rows) }));
    expect(v).not.toBeNull();
    expect(o.reduce((n, x) => n + x.count, 0)).toBe(rows.length);
  });
});

describe('compactRanges', async () => {
  const { compactRanges } = await import('../src/components/SitemapInsights');
  it('joins runs of three or more and caps long lists', () => {
    expect(compactRanges([3, 4, 7, 8, 9, 12])).toBe('003, 004, 007–009, 012');
    expect(compactRanges([1, 3, 5, 7, 9, 11, 13], 3)).toBe('001, 003, 005, …');
  });
});

describe('dashboard wiring', () => {
  const c = readFileSync('src/components/SitemapDashboard.tsx', 'utf8');
  it('places the insights between the stat tiles and the chart cards, and overlays events on two charts', () => {
    expect(c.indexOf('viz-tiles')).toBeLessThan(c.indexOf('<SitemapInsights'));
    expect(c.indexOf('<SitemapInsights')).toBeLessThan(c.indexOf('className="viz-cards"'));
    expect(c.match(/markers=\{/g)?.length).toBe(2);
  });
  it('labels every insight as a fact or an inference', () => {
    const i = readFileSync('src/components/SitemapInsights.tsx', 'utf8');
    expect(i).toContain("kind: { fact: 'Fakta', inference: 'Dugaan' }");
    expect(i).toContain("kind: { fact: 'Fact', inference: 'Inference' }");
  });
});

import { nameInSlugs, slugWeekdays, slugWaves, sectionVelocity } from '../src/lib/sitemap-insights';

describe('deeper sitemap insights', () => {
  const r = (path: string, idDate: string | null, group: 'evidence' | 'targets' | 'documents' | 'other' = 'evidence') =>
    ({ path, group, section: group, idDate, lastmod: null, firstSeen: '2026-11-13', lastSeen: '2026-11-13', removed: false, images: 0 });
  const rows = [r('/evidence/ev-20261109-001-rahmat-wibowo-x/', '2026-11-09'), r('/evidence/ev-20261110-001-other/', '2026-11-10'), r('/targets/budi/', null, 'targets')];
  it('counts slugs that carry the Pelapor\'s name', () => {
    expect(nameInSlugs(rows)).toEqual({ n: 1, total: 3, share: 33, evidence: 1, evidenceTotal: 2 });
  });
  it('counts slug weekdays and per-section speed', () => {
    expect(slugWeekdays(rows)).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(sectionVelocity(rows, '2026-11-12', 7)).toEqual([{ group: 'evidence', n: 2, perWeek: 2 }]);
  });
  it('finds bursts of dated items', () => {
    const many = Array.from({ length: 12 }, (_, i) => r(`/evidence/ev-${i}/`, `2026-05-${String(1 + i).padStart(2, '0')}`));
    expect(slugWaves(many).map((w) => [w.from, w.to, w.count])).toEqual([['2026-05-01', '2026-05-12', 12]]);
  });
});

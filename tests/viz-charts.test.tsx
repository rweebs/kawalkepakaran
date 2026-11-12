import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Card, HBars, Legend, Sparkline, StackedBars, compressSlots, yearSpans, rovingIndex, niceTicks, EmptyState, type StackDatum } from '../src/components/viz/charts';
import { encodeState, decodeState, hashQuery } from '../src/components/viz/url-state';

type K = 'a' | 'b';
const month = (key: string, a: number, b = 0): StackDatum<K> => ({ key, label: key.slice(5), tip: key, counts: { a, b } });
const bars = (data: StackDatum<K>[], extra: Record<string, unknown> = {}) => renderToString(
  <StackedBars data={data} series={['a', 'b'] as const} fill={(k) => `f-${k}`} stroke={(k) => `s-${k}`} seriesLabel={(k) => k} locale="id" unit="item" {...extra} />,
);

describe('layout helpers', () => {
  it('collapses long empty runs between data into one gap slot, never at the edges', () => {
    expect(compressSlots([false, true, true, true, false], 3)).toEqual([{ type: 'bar', i: 0 }, { type: 'gap', from: 1, to: 3 }, { type: 'bar', i: 4 }]);
    expect(compressSlots([false, true, true, false], 3).map((s) => s.type)).toEqual(['bar', 'bar', 'bar', 'bar']);
    expect(compressSlots([true, true, true, false], 2).map((s) => s.type)).toEqual(['bar', 'bar', 'bar', 'bar']);
    expect(compressSlots([false, true, true, true, false], 0)).toHaveLength(5);
  });
  it('builds one year bracket per calendar year across slots, skipping gap slots', () => {
    expect(yearSpans(['2023-11', '2023-12', null, '2026-04', '2026-05'])).toEqual([
      { year: '2023', from: 0, to: 1 }, { year: '2026', from: 3, to: 4 },
    ]);
  });
  it('moves a roving index with arrows, Home and End, clamped', () => {
    expect(rovingIndex('ArrowRight', 2, 5)).toBe(3);
    expect(rovingIndex('ArrowRight', 4, 5)).toBe(4);
    expect(rovingIndex('ArrowLeft', 0, 5)).toBe(0);
    expect(rovingIndex('Home', 3, 5)).toBe(0);
    expect(rovingIndex('End', 0, 5)).toBe(4);
    expect(rovingIndex('a', 0, 5)).toBeNull();
    expect(niceTicks(23)).toEqual([0, 10, 20, 30]);
  });
});

describe('StackedBars markup', () => {
  const data = [month('2023-10', 5), month('2023-11', 2, 1), month('2023-12', 0), month('2024-01', 0), month('2024-02', 0), month('2024-03', 0), month('2026-04', 7)];
  it('is a labelled group with exactly one tab stop (roving tabindex), not role=img', () => {
    const html = bars(data);
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="img"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
  it('collapses the empty run into a labelled break and draws a year band for month keys', () => {
    const html = bars(data, { compressGaps: 3 });
    expect(html).toContain('viz-break');
    expect(html).toContain('2023-12 – 2024-03');
    expect(html).toContain('viz-year');
    expect(html).toMatch(/>2026</);
  });
  it('omits hidden series, labels the selected bar total, and renders the 100%-wide box before measuring', () => {
    const html = bars(data, { hidden: new Set(['b']), selected: 1 });
    expect(html).not.toContain('class="s-b"');
    expect(html).toContain('viz-bar-total');
    expect(html).toContain('width="100%"');
    expect(html).toContain('viewBox="0 0 640');
    expect(html).toContain('viz-texture');
  });
});

describe('other primitives', () => {
  it('HBars with selection is a group with one tab stop', () => {
    const html = renderToString(<HBars locale="id" unit="x" onSelect={() => {}} rows={[{ key: 'a', label: 'A', n: 3 }, { key: 'b', label: 'B', n: 1 }]} />);
    expect(html).toContain('role="group"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });
  it('legend toggles are buttons with aria-pressed; Card carries export buttons; empty states differ', () => {
    const lg = renderToString(<Legend label="L" items={[{ key: 'a', label: 'A', cls: 'f-a' }]} hidden={new Set(['a'])} onToggle={() => {}} />);
    expect(lg).toContain('aria-pressed="false"');
    const card = renderToString(<Card title="T"><p>x</p></Card>);
    expect(card).toContain('viz-export__btn');
    expect(renderToString(<Card title="T" exportable={false}><p>x</p></Card>)).not.toContain('viz-export');
    expect(renderToString(<EmptyState kind="filtered" text="none" onClear={() => {}} clearLabel="Clear" />)).toContain('Clear');
    expect(renderToString(<EmptyState kind="nodata" text="none" />)).not.toContain('button');
  });
  it('draws a sparkline only for two or more values', () => {
    expect(renderToString(<Sparkline values={[1, 3, 2]} label="trend" />)).toContain('viz-spark__line');
    expect(renderToString(<Sparkline values={[1]} label="trend" />)).toBe('');
  });
});

describe('URL hash state', () => {
  const init = { groups: ['a', 'b'], q: '', basis: 'id', n: 3, on: false };
  it('writes only what differs from the initial state, in a readable form', () => {
    expect(encodeState(init, init)).toBe('');
    expect(encodeState({ ...init, groups: ['a'], q: 'abil somasi', n: 5 }, init)).toBe('groups=a&q=abil+somasi&n=5');
  });
  it('round-trips and ignores malformed values', () => {
    const s = { ...init, groups: ['b'], q: 'x', on: true };
    expect(decodeState(encodeState(s, init), init)).toEqual(s);
    expect(decodeState('n=notjson&on=1', init)).toEqual(init);
  });
  it('reads only its own hash key', () => {
    expect(hashQuery('#situs?q=a', 'situs')).toBe('q=a');
    expect(hashQuery('#situs', 'situs')).toBe('');
    expect(hashQuery('#fomo?q=a', 'situs')).toBeNull();
  });
});

describe('sitemap dashboard uses the shared primitives', () => {
  const c = readFileSync('src/components/SitemapDashboard.tsx', 'utf8');
  it('has no private copies of the chart pieces and keeps filters in the URL with a debounced search', () => {
    expect(c).not.toMatch(/function (useWidth|StackedBars|LineChart|HBars|Tooltip)\b/);
    expect(c).toContain("from './viz/charts'");
    expect(c).toContain("useHashState<Filters>('situs'");
    expect(c).toContain('useDebounced(qInput, 150)');
  });
});

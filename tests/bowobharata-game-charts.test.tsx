import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { BarList, Columns, StatTiles, TimeStrip, type Mark, type TableLabels } from '../src/components/bowobharata-game/charts';

const table: TableLabels = { show: 'Show as table', key: 'Item', value: 'Count' };
const count = (html: string, s: string) => html.split(s).length - 1;
const clean = (html: string) => {
  expect(html).not.toMatch(/NaN|Infinity|undefined/);
};
const days = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({ key: `2026-06-${String(from + i).padStart(2, '0')}`, n: i % 3 === 0 ? 0 : i }));
const months = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const k = 2023 * 12 + 8 + i;
    return { key: `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`, n: i % 4 };
  });
const labelled = (html: string) => {
  const id = /aria-labelledby="([^"]+)"/.exec(html)![1];
  expect(html).toContain(`<h4 id="${id}">`);
};

describe('StatTiles', () => {
  it('renders each tile in order with value and note', () => {
    const html = renderToString(<StatTiles tiles={[{ label: 'A', value: 3, note: 'x' }, { label: 'B', value: 0 }, { label: 'C', value: 12, note: 'z' }]} />);
    expect(count(html, 'class="bg-tile"')).toBe(3);
    expect(html.indexOf('>A<')).toBeLessThan(html.indexOf('>B<'));
    expect(html.indexOf('>B<')).toBeLessThan(html.indexOf('>C<'));
    expect(html).toContain('<b>3</b><span> x</span>');
    expect(html).toContain('<b>0</b></dd>');
    expect(html).toContain('<b>12</b><span> z</span>');
  });
});

describe('BarList', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ label: `Pasal ${i}`, n: 12 - i }));
  const html = renderToString(<BarList id="b" title="Pasal" rows={rows} limit={8} other={({ items }) => `+${items} more`} table={table} />);
  it('shows the limit, sums up the rest and keeps every row in the table', () => {
    expect(count(html, '<li>')).toBe(8);
    expect(html).toContain('<p class="bg-chart__note">+4 more</p>');
    expect(count(html, '<tr>')).toBe(13);
    labelled(html);
  });
  it('scales bars to the largest count', () => {
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('style="width:50%"');
    clean(html);
  });
  it('renders empty rows without a list item or NaN', () => {
    const e = renderToString(<BarList id="b" title="Pasal" rows={[]} table={table} />);
    expect(count(e, '<li>')).toBe(0);
    clean(e);
    clean(renderToString(<BarList id="b" title="Pasal" rows={[{ label: 'x', n: 0 }]} table={table} />));
  });
});

describe('Columns', () => {
  const marks: Mark[] = [{ from: '2026-06-02', to: '2026-06-04', label: '4', current: true }, { from: '2026-06-03', to: '2026-06-06', label: '5', current: false }];
  it('draws a rect per non-empty day bin, each with a title', () => {
    const bins = days(7);
    const html = renderToString(<Columns id="c" locale="id" title="T" unit="day" bins={bins} table={table} />);
    const nonzero = bins.filter((b) => b.n > 0).length;
    expect(count(html, 'class="bg-col"')).toBe(nonzero);
    expect(count(html, '<title>')).toBe(nonzero);
    expect(html).toContain('<title>2 Jun 2026: 1</title>');
    expect(count(html, '<tr>')).toBe(8);
    clean(html);
    labelled(html);
  });
  it('notes undated rows only when there are some', () => {
    const note = ({ n }: { n: number }) => `${n} undated`;
    expect(renderToString(<Columns id="c" locale="en" title="T" unit="day" bins={days(3)} undated={2} undatedNote={note} table={table} />)).toContain('2 undated');
    expect(renderToString(<Columns id="c" locale="en" title="T" unit="day" bins={days(3)} undated={0} undatedNote={note} table={table} />)).not.toContain('undated');
  });
  it('marks the current band and keeps overlapping labels on different rows', () => {
    const html = renderToString(<Columns id="c" locale="id" title="T" unit="day" bins={days(7)} marks={marks} table={table} />);
    expect(count(html, 'data-current')).toBe(1);
    expect(count(html, 'class="bg-mark"')).toBe(2);
    const ys = [...html.matchAll(/class="bg-mark__label"[^>]* y="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(ys).size).toBe(2);
  });
  it('labels few month ticks on a long month axis', () => {
    const html = renderToString(<Columns id="c" locale="id" title="T" unit="month" bins={months(32)} table={table} />);
    const ticks = [...html.matchAll(/<text[^>]*y="154"[^>]*>/g)];
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(count(html, '<tr>')).toBe(33);
    clean(html);
  });
  it('shows the day of the month, the first with its month, every 7th past 11 bins', () => {
    const html = renderToString(<Columns id="c" locale="en" title="T" unit="day" bins={days(30)} table={table} />);
    expect(html).toContain('>1 Jun<');
    expect(html).toContain('>8<');
    expect(html).not.toContain('>9<');
  });
  it('renders empty bins without NaN', () => {
    clean(renderToString(<Columns id="c" locale="id" title="T" unit="month" bins={[]} marks={marks} undated={0} table={table} />));
    clean(renderToString(<Columns id="c" locale="id" title="T" unit="day" bins={[{ key: '2026-06-01', n: 0 }]} table={table} />));
  });
});

describe('TimeStrip', () => {
  const span = { from: '2023-09-01', to: '2026-10-31' };
  const marks: Mark[] = [{ from: '2026-05-01', to: '2026-06-30', label: '5', current: true }, { from: '2024-01-01', to: '2024-02-01', label: '1', current: false }];
  const lanes = [{ label: 'A', dates: ['2024-03-01', '2025-01-01', '2020-01-01'] }, { label: 'B', dates: ['2026-09-09', '2030-01-01'] }];
  const html = renderToString(<TimeStrip id="s" locale="id" title="T" span={span} marks={marks} lanes={lanes} table={table} />);
  it('draws a dot per date, clamped to the span, and the current mark', () => {
    expect(count(html, 'class="bg-dot"')).toBe(5);
    expect(count(html, 'data-current')).toBe(1);
    expect(html).toContain('viewBox="0 0 640 84"');
    expect(html).toContain('>2024<');
    clean(html);
  });
  it('renders without lanes or dates', () => {
    clean(renderToString(<TimeStrip id="s" locale="en" title="T" span={{ from: '2026-01-01', to: '2026-01-01' }} marks={[]} lanes={[]} table={table} />));
  });
});

describe('accessibility', () => {
  it('points every figure at its heading and carries the table labels', () => {
    const htmls = [
      renderToString(<BarList id="a" title="A" rows={[{ label: 'x', n: 1 }]} table={table} />),
      renderToString(<Columns id="b" locale="id" title="B" unit="day" bins={days(3)} table={table} />),
      renderToString(<TimeStrip id="c" locale="id" title="C" span={{ from: '2026-01-01', to: '2026-02-01' }} marks={[]} lanes={[{ label: 'L', dates: ['2026-01-05'] }]} table={table} />),
    ];
    for (const h of htmls) {
      labelled(h);
      expect(h).toContain('<summary>Show as table</summary>');
      expect(h).toContain('>Item<');
      expect(h).toContain('>Count<');
    }
    expect(htmls[1]).toContain('role="img" aria-labelledby="b-t"');
  });
});

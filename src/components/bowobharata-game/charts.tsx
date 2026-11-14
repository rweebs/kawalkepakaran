// The chapter reports' charts, rendered from props only: every string comes in by props and no chart reads a clock or a
// random number, so the markup is the same each time and can be checked with renderToString. Each chart ends with a table
// twin that carries every value. Series colour goes on marks only; all text is ink.
import '../../styles/bowobharata-game-charts.css';
import type { Locale } from '../../i18n';
import { dayNumber, monthIndex, monthTicks, niceMax, r1, xOf } from '../../lib/bowobharata-game/chart-math';
import type { Bin, Count } from '../../lib/bowobharata-game/report-types';

export interface TableLabels { show: string; key: string; value: string }
export interface Tile { label: string; value: number; note?: string }
export interface Mark { from: string; to: string; label: string; current: boolean }
export interface Lane { label: string; dates: readonly string[] }

const DAY_MS = 86_400_000;
const utc = (iso: string): Date => new Date(dayNumber(iso) * DAY_MS);
const tag = (l: Locale) => (l === 'en' ? 'en-US' : 'id-ID');
const fmt = (l: Locale, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag(l), { ...o, timeZone: 'UTC' });

/** Rows for the table twin. */
function Table({ labels, rows }: { labels: TableLabels; rows: readonly (readonly [string, number])[] }) {
  return (
    <details className="bg-chart__table">
      <summary>{labels.show}</summary>
      <table>
        <thead><tr><th scope="col">{labels.key}</th><th scope="col">{labels.value}</th></tr></thead>
        <tbody>
          {rows.map(([k, n], i) => <tr key={i}><td>{k}</td><td>{String(n)}</td></tr>)}
        </tbody>
      </table>
    </details>
  );
}

function Figure({ id, kind, title, note, children }: { id: string; kind: 'bars' | 'columns' | 'strip'; title: string; note?: string; children: React.ReactNode }) {
  return (
    <figure className={`bg-chart bg-chart--${kind}`} aria-labelledby={`${id}-t`}>
      <figcaption>
        <h4 id={`${id}-t`}>{title}</h4>
        {note && <p className="bg-chart__note">{note}</p>}
      </figcaption>
      {children}
    </figure>
  );
}

export function StatTiles({ tiles }: { tiles: readonly Tile[] }) {
  return (
    <dl className="bg-tiles">
      {tiles.map((t, i) => (
        <div className="bg-tile" key={i}>
          <dt>{t.label}</dt>
          <dd><b>{String(t.value)}</b>{t.note && <span>{` ${t.note}`}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BarList({ id, title, note, rows, limit, other, table }: {
  id: string; title: string; note?: string; rows: readonly Count[]; limit?: number; other?: (o: { items: number }) => string; table: TableLabels;
}) {
  const shown = limit === undefined ? rows : rows.slice(0, limit);
  const rest = rows.length - shown.length;
  const max = rows.reduce((m, r) => Math.max(m, r.n), 0);
  return (
    <Figure id={id} kind="bars" title={title} note={note}>
      <ol className="bg-bars">
        {shown.map((r, i) => (
          <li key={i}>
            <span className="bg-bars__label">{r.label}</span>
            <span className="bg-bars__track" aria-hidden="true">
              <span className="bg-bars__bar" style={{ width: `${max > 0 ? r1((100 * r.n) / max) : 0}%` }} />
            </span>
            <b className="bg-bars__n">{String(r.n)}</b>
          </li>
        ))}
      </ol>
      {rest > 0 && other && <p className="bg-chart__note">{other({ items: rest })}</p>}
      <Table labels={table} rows={rows.map((r) => [r.label, r.n] as const)} />
    </Figure>
  );
}

const W = 640;
/** A mark's label goes on the first of two rows whose last band it does not overlap (or whose last label it clears), so overlapping bands keep both labels legible. */
function labelRows(items: readonly { x: number; w: number; text: string }[]): number[] {
  const ends: number[] = [-Infinity, -Infinity];
  return items.map((it) => {
    let row = ends.findIndex((e) => e <= it.x);
    if (row < 0) row = ends[0] <= ends[1] ? 0 : 1;
    ends[row] = Math.max(it.x + it.w, it.x + it.text.length * 6.5 + 6);
    return row;
  });
}
const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface Band { x: number; w: number; mark: Mark }
function MarkBands({ bands, top, bottom }: { bands: readonly Band[]; top: number; bottom: number }) {
  return (
    <>
      {bands.map((b, i) => (
        <rect key={i} className="bg-mark" x={r1(b.x)} y={top} width={r1(b.w)} height={r1(bottom - top)} data-current={b.mark.current ? '' : undefined} />
      ))}
    </>
  );
}
function MarkLabels({ bands, rowY }: { bands: readonly Band[]; rowY: readonly number[] }) {
  const rows = labelRows(bands.map((b) => ({ x: b.x, w: b.w, text: b.mark.label })));
  return (
    <>
      {bands.map((b, i) => {
        const late = b.x + b.mark.label.length * 6.5 > W - 4;
        return (
          <text key={i} className="bg-mark__label" x={r1(late ? b.x + b.w - 2 : b.x + 2)} y={rowY[rows[i]]} textAnchor={late ? 'end' : 'start'}>{b.mark.label}</text>
        );
      })}
    </>
  );
}

export function Columns({ id, locale, title, note, unit, bins, marks, undated, undatedNote, table }: {
  id: string; locale: Locale; title: string; note?: string; unit: 'day' | 'month'; bins: readonly Bin[]; marks?: readonly Mark[];
  undated?: number; undatedNote?: (o: { n: number }) => string; table: TableLabels;
}) {
  const H = 160;
  const left = 28, right = W - 8, top = 28, base = 138;
  const date = unit === 'day'
    ? (k: string) => fmt(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(utc(k))
    : (k: string) => fmt(locale, { month: 'short', year: 'numeric' }).format(utc(`${k}-01`));
  const slotOf = unit === 'day' ? (k: string) => dayNumber(k) : (k: string) => monthIndex(k);
  const first = bins.length ? slotOf(bins[0].key) : 0;
  const count = bins.length ? Math.max(1, slotOf(bins[bins.length - 1].key) - first + 1) : 1;
  const slot = (right - left) / count;
  const peak = niceMax(bins.reduce((m, b) => Math.max(m, b.n), 0));
  const yOf = (n: number) => base - (n / peak) * (base - top);
  const grid = peak >= 2 && Number.isInteger(peak / 2) ? [peak / 2, peak] : [peak];
  const barW = Math.max(1, Math.min(24, slot - 2));
  const cx = (s: number) => left + (s + 0.5) * slot;

  const bands: Band[] = bins.length
    ? (marks ?? []).flatMap((m) => {
        const a = clampTo(slotOf(m.from) - first, 0, count);
        const b = clampTo(slotOf(m.to) - first + 1, 0, count);
        return b > a ? [{ x: left + a * slot, w: (b - a) * slot, mark: m }] : [];
      })
    : [];

  const ticks: { s: number; text: string }[] = [];
  if (bins.length) {
    if (unit === 'day') {
      const every = bins.length <= 11 ? 1 : 7;
      bins.forEach((b, i) => {
        if (i % every) return;
        const d = utc(b.key);
        const dd = String(d.getUTCDate());
        ticks.push({ s: slotOf(b.key) - first, text: i === 0 ? `${dd} ${fmt(locale, { month: 'short' }).format(d)}` : dd });
      });
    } else {
      for (const k of monthTicks(bins[0].key, bins[bins.length - 1].key, 8)) {
        const d = utc(`${k}-01`);
        const m = fmt(locale, { month: 'short' }).format(d);
        ticks.push({ s: monthIndex(k) - first, text: k.endsWith('-01') ? `${m} ${k.slice(0, 4)}` : m });
      }
    }
  }

  return (
    <Figure id={id} kind="columns" title={title} note={note}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
        <clipPath id={`${id}-clip`}><rect x={0} y={0} width={W} height={base} /></clipPath>
        <MarkBands bands={bands} top={top} bottom={base} />
        {grid.map((g) => (
          <g key={g}>
            <line className="bg-chart__grid" x1={left} x2={right} y1={r1(yOf(g))} y2={r1(yOf(g))} />
            <text x={left - 4} y={r1(yOf(g) + 4)} textAnchor="end">{String(g)}</text>
          </g>
        ))}
        <g clipPath={`url(#${id}-clip)`}>
          {bins.filter((b) => b.n > 0).map((b) => {
            const h = base - yOf(b.n);
            return (
              <rect key={b.key} className="bg-col" data-key={b.key} x={r1(cx(slotOf(b.key) - first) - barW / 2)} y={r1(yOf(b.n))} width={r1(barW)} height={r1(h + 4)} rx={Math.min(4, r1(barW / 2))}>
                <title>{`${date(b.key)}: ${b.n}`}</title>
              </rect>
            );
          })}
        </g>
        <line className="bg-chart__base" x1={left} x2={right} y1={base} y2={base} />
        {ticks.map((t, i) => {
          const x = cx(t.s);
          const edge = x < left + 14 ? 'start' : x > right - 14 ? 'end' : 'middle';
          return <text key={i} x={r1(edge === 'start' ? left : edge === 'end' ? right : x)} y={base + 16} textAnchor={edge}>{t.text}</text>;
        })}
        <MarkLabels bands={bands} rowY={[10, 22]} />
      </svg>
      {undated !== undefined && undated > 0 && undatedNote && <p className="bg-chart__note">{undatedNote({ n: undated })}</p>}
      <Table labels={table} rows={bins.map((b) => [date(b.key), b.n] as const)} />
    </Figure>
  );
}

export function TimeStrip({ id, locale, title, note, span, marks, lanes, table }: {
  id: string; locale: Locale; title: string; note?: string; span: { from: string; to: string }; marks: readonly Mark[]; lanes: readonly Lane[]; table: TableLabels;
}) {
  const H = 40 + 22 * lanes.length;
  const pad = 4, inner = W - 2 * pad;
  const x = (iso: string) => pad + xOf(iso, span, inner);
  const laneTop = 26;
  const axis = laneTop + 22 * lanes.length + 2;
  const full = (iso: string) => fmt(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(utc(iso));

  const bands: Band[] = marks.flatMap((m) => {
    const a = x(m.from);
    const b = x(m.to);
    return b >= a ? [{ x: a, w: Math.max(2, b - a), mark: m }] : [];
  });

  const y0 = Number(span.from.slice(0, 4));
  const y1 = Number(span.to.slice(0, 4));
  const stepY = Math.max(1, Math.ceil((y1 - y0 + 1) / 8));
  const years: { x: number; text: string }[] = [];
  for (let y = y0; y <= y1; y += 1) {
    const jan = `${y}-01-01`;
    if (dayNumber(jan) < dayNumber(span.from) || dayNumber(jan) > dayNumber(span.to) || (y - y0) % stepY) continue;
    years.push({ x: x(jan), text: String(y) });
  }
  if (!years.length || years[0].x > 40) years.unshift({ x: x(span.from), text: span.from.slice(0, 4) });

  return (
    <Figure id={id} kind="strip" title={title} note={note}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
        <MarkBands bands={bands} top={laneTop} bottom={axis} />
        <line className="bg-chart__base" x1={pad} x2={W - pad} y1={axis} y2={axis} />
        {years.map((t, i) => (
          <g key={i}>
            <line className="bg-chart__grid" x1={r1(t.x)} x2={r1(t.x)} y1={axis} y2={axis + 4} />
            <text x={r1(t.x)} y={H - 1} textAnchor={i === 0 && t.x < 20 ? 'start' : 'middle'}>{t.text}</text>
          </g>
        ))}
        {lanes.map((l, i) => (
          <g key={i}>
            <text x={pad} y={laneTop + 22 * i + 9}>{l.label}</text>
            {l.dates.map((d, j) => (
              <circle key={j} className="bg-dot" cx={r1(x(d))} cy={laneTop + 22 * i + 16} r={4}>
                <title>{full(d)}</title>
              </circle>
            ))}
          </g>
        ))}
        <MarkLabels bands={bands} rowY={[10, 22]} />
      </svg>
      <Table labels={table} rows={lanes.map((l) => [l.label, l.dates.length] as const)} />
    </Figure>
  );
}

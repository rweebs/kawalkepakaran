// Series-generic SVG chart pieces for the site's dashboards: measured to their container (text stays at real size on a
// phone), server-rendered, hover + keyboard tooltips, 2px gaps between stacked segments, 4px rounded data-ends.
// Colors come from CSS classes the caller passes, so each dashboard keeps its own validated palette.
//
// Accessibility: an interactive chart is a role="group" with ONE tab stop (roving tabindex); arrow keys, Home and End
// move between bars, Enter/Space selects, and the focused bar gets a drawn focus ring. Forced-colors mode adds a
// texture per series so identity never rests on color alone.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChartExport } from './export';

export type Locale = 'id' | 'en';
export const fmtN = (n: number, locale: Locale) => new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(n);
export const fmtMonth = (ym: string, locale: Locale, withYear: boolean) =>
  new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { month: 'short', ...(withYear ? { year: '2-digit' } : {}), timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
export const fmtDay = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** 0 plus round steps covering max (about four intervals). */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out = [0];
  while (out.at(-1)! < max) out.push(Math.round((out.at(-1)! + step) * 100) / 100);
  return out;
}

/**
 * Container width, measured after hydration. `measured` is false on the server and the first client render: charts then
 * draw at the fallback width scaled into a 100%-wide box (viewBox), so the height never jumps when the real width lands.
 */
export function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { setW(Math.max(260, Math.round(e.contentRect.width))); setMeasured(true); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w, measured] as const;
}

/** Width and height attributes for a chart SVG: exact pixels once measured, otherwise 100% wide with a viewBox. */
export const svgBox = (w: number, h: number, measured: boolean) =>
  measured ? { width: w, height: h } : { width: '100%', height: h, viewBox: `0 0 ${w} ${h}` };

const textCache = new Map<string, number>();
let canvasCtx: CanvasRenderingContext2D | null | undefined;
/**
 * Rendered width of `s` in px at the chart text size; measured with a canvas once per string. With `exact` false (the
 * server and the hydration render) it returns the same estimate on both sides, so server and client markup match.
 */
export function measureText(s: string, size = 12, weight = 400, exact = true): number {
  if (!exact || typeof document === 'undefined') return s.length * size * 0.6;
  const key = `${size}|${weight}|${s}`;
  const hit = textCache.get(key);
  if (hit !== undefined) return hit;
  let w = s.length * size * 0.6;
  if (canvasCtx === undefined) canvasCtx = document.createElement('canvas').getContext('2d');
  if (canvasCtx) {
    canvasCtx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily || 'system-ui'}`;
    w = canvasCtx.measureText(s).width;
  }
  textCache.set(key, w);
  return w;
}

export interface TipLine { cls?: string; value: string; label: string }
export function Tooltip({ x, y, w, h, title, lines }: { x: number; y: number; w: number; h: number; title: string; lines: TipLine[] }) {
  const lh = 18;
  const width = Math.min(w - 8, Math.max(measureText(title, 12, 600), ...lines.map((l) => measureText(l.value, 12, 700) + measureText(` ${l.label}`) + (l.cls ? 18 : 0))) + 22);
  const height = 26 + lines.length * lh;
  const tx = Math.min(Math.max(x + 12, 4), w - width - 4);
  const ty = Math.min(Math.max(y - height - 8, 4), h - height - 4);
  return (
    <g className="viz-tip" transform={`translate(${tx},${ty})`} pointerEvents="none">
      <rect width={width} height={height} rx={6} />
      <text x={10} y={17} className="viz-tip__title">{title}</text>
      {lines.map((l, i) => (
        <g key={i} transform={`translate(10,${34 + i * lh})`}>
          {l.cls && <line x1={0} x2={12} y1={-4} y2={-4} className={l.cls} strokeWidth={2.5} />}
          <text x={l.cls ? 18 : 0} y={0}><tspan className="viz-tip__val">{l.value}</tspan><tspan className="viz-tip__lab"> {l.label}</tspan></text>
        </g>
      ))}
    </g>
  );
}

/**
 * Legend; with `onToggle` each entry is a toggle button that hides or shows its series (colors stay with the entity).
 * Hiding the last visible series is left to the caller to refuse.
 */
export function Legend({ items, label, hidden, onToggle }: {
  items: { key: string; label: string; cls: string }[]; label: string; hidden?: ReadonlySet<string>; onToggle?: (key: string) => void;
}) {
  return (
    <ul className={`viz-legend viz-legend--sans${onToggle ? ' viz-legend--toggle' : ''}`} aria-label={label}>
      {items.map((i) => (
        <li key={i.key}>
          {onToggle ? (
            <button type="button" className="viz-legend__btn" aria-pressed={!hidden?.has(i.key)} onClick={() => onToggle(i.key)}>
              <span className={`viz-key ${i.cls}`} aria-hidden="true" />{i.label}
            </button>
          ) : <><span className={`viz-key ${i.cls}`} aria-hidden="true" />{i.label}</>}
        </li>
      ))}
    </ul>
  );
}

/** A chart card. Charts inside get SVG/PNG export buttons (title and source line baked into the file) unless `exportable` is false. */
export function Card({ title, note, children, wide, id, exportable = true, source, locale }: {
  title: string; note?: ReactNode; children: ReactNode; wide?: boolean; id?: string; exportable?: boolean; source?: string; locale?: Locale;
}) {
  return (
    <figure className={`viz-card${wide ? ' viz-card--wide' : ''}`} id={id}>
      <figcaption>
        <div className="viz-card__head"><h3>{title}</h3>{exportable && <ChartExport title={title} source={source} locale={locale} />}</div>
        {note && <p className="muted">{note}</p>}
      </figcaption>
      {children}
    </figure>
  );
}

/** "Nothing at all" and "nothing for this filter" look different; the second offers a one-click clear. */
export function EmptyState({ kind, text, onClear, clearLabel }: { kind: 'nodata' | 'filtered'; text: ReactNode; onClear?: () => void; clearLabel?: string }) {
  return (
    <div className={`viz-empty viz-empty--${kind}`} role="status">
      <span className="viz-empty__icon" aria-hidden="true">{kind === 'filtered' ? '⌀' : '…'}</span>
      <p>{text}</p>
      {kind === 'filtered' && onClear && <button type="button" className="viz-chip" onClick={onClear}>{clearLabel ?? '×'}</button>}
    </div>
  );
}

/** A bar segment; the topmost gets the 4px rounded data-end, the baseline side stays square. */
const barPath = (x: number, y: number, w: number, h: number, round: boolean) => {
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

/** A case-timeline event drawn on a chart: a thin solid hairline, named in the tooltip of its bar or day and in <title>. */
export interface Marker { key: string; label: string }
const short = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Moves a roving focus index with the arrow keys, Home and End. Returns the new index, or null for other keys. */
export function rovingIndex(key: string, i: number, n: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(n - 1, i + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, i - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}

export type Slot = { type: 'bar'; i: number } | { type: 'gap'; from: number; to: number };
/**
 * Layout slots for a time axis: runs of at least `minRun` consecutive empty bars collapse into one gap slot, so two
 * separated waves each get width. `minRun` 0 or below disables it.
 */
export function compressSlots(empty: readonly boolean[], minRun = 0): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < empty.length;) {
    if (minRun > 0 && empty[i]) {
      let j = i;
      while (j + 1 < empty.length && empty[j + 1]) j += 1;
      if (j - i + 1 >= minRun && i > 0 && j < empty.length - 1) out.push({ type: 'gap', from: i, to: j });
      else for (let k = i; k <= j; k++) out.push({ type: 'bar', i: k });
      i = j + 1;
      continue;
    }
    out.push({ type: 'bar', i });
    i += 1;
  }
  return out;
}

/** Year brackets under a month axis: one span per calendar year present, by slot position. Keys must be YYYY-MM. */
export function yearSpans(keys: readonly (string | null)[]): { year: string; from: number; to: number }[] {
  const out: { year: string; from: number; to: number }[] = [];
  keys.forEach((k, s) => {
    if (!k) return;
    const y = k.slice(0, 4);
    const last = out.at(-1);
    if (last && last.year === y) last.to = s;
    else out.push({ year: y, from: s, to: s });
  });
  return out;
}

const GAP_W = 26;
const TEXTURES = ['viz-tex-a', 'viz-tex-b', 'viz-tex-c', 'viz-tex-d', 'viz-tex-e', 'viz-tex-f'];

function Textures({ uid }: { uid: string }) {
  return (
    <defs>
      {TEXTURES.map((tx, k) => (
        <pattern key={tx} id={`${uid}-${tx}`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform={`rotate(${[45, 135, 0, 90, 45, 135][k]})`}>
          {k >= 4 ? <circle cx={3} cy={3} r={1.2} className="viz-tex-ink" /> : <line x1={0} y1={0} x2={0} y2={6} className="viz-tex-ink" strokeWidth={k % 2 ? 1 : 1.6} />}
        </pattern>
      ))}
    </defs>
  );
}

export interface StackDatum<K extends string> { key: string; label: string; tip: string; counts: Record<K, number> }

/**
 * Vertical stacked bars over a time axis. `series` is the bottom-to-top order; `fill(k)` / `stroke(k)` give the CSS classes.
 * Optional: `hidden` series are left out (legend toggles), `markers` draw event hairlines on matching keys,
 * `compressGaps` collapses long empty runs into a labelled break, and month keys (YYYY-MM) get a year band.
 */
export function StackedBars<K extends string>({ data, series, fill, stroke, seriesLabel, locale, unit, height = 220, selected, onSelect, hidden, markers = [], compressGaps = 0, yearBand = true }: {
  data: StackDatum<K>[]; series: readonly K[]; fill: (k: K) => string; stroke: (k: K) => string; seriesLabel: (k: K) => string;
  locale: Locale; unit: string; height?: number; selected?: number | null; onSelect?: (i: number) => void;
  hidden?: ReadonlySet<string>; markers?: readonly Marker[]; compressGaps?: number; yearBand?: boolean;
}) {
  const [ref, W, measured] = useWidth(640);
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const shownSeries = series.filter((k) => !hidden?.has(k));
  const total = (d: StackDatum<K>) => shownSeries.reduce((n, k) => n + (d.counts[k] ?? 0), 0);
  const slots = compressSlots(data.map((d) => total(d) === 0), compressGaps);
  const months = yearBand && data.length > 1 && data.every((d) => /^\d{4}-\d{2}$/.test(d.key));
  const H = W > 900 ? Math.round(Math.min(height * 1.35, Math.max(height, W * 0.2))) : height;
  const m = { t: 18, r: 8, b: months ? 42 : 26, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const ticks = niceTicks(Math.max(1, ...data.map(total)));
  const top = ticks.at(-1)!;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const nGaps = slots.filter((s) => s.type === 'gap').length;
  const nBars = slots.length - nGaps;
  const band = Math.max(1, (iw - nGaps * GAP_W) / Math.max(1, nBars));
  // x of each slot's left edge, and of each data index (gap members map to their gap slot).
  const slotX: number[] = [];
  const xOf = new Map<number, { x: number; w: number }>();
  let cx = m.l;
  for (const s of slots) {
    slotX.push(cx);
    if (s.type === 'bar') { xOf.set(s.i, { x: cx, w: band }); cx += band; } else { for (let i = s.from; i <= s.to; i++) xOf.set(i, { x: cx, w: GAP_W }); cx += GAP_W; }
  }
  const bw = Math.max(2, Math.min(28, band - 2));
  const labelled = data.filter((d) => d.label).length;
  const every = labelled * 44 <= iw ? 1 : Math.max(1, Math.ceil(44 / band));
  const barIdx = slots.flatMap((s) => (s.type === 'bar' ? [s.i] : []));
  const [active, setActive] = useState<number>(() => selected ?? barIdx.at(-1) ?? 0);
  const activeIdx = barIdx.includes(active) ? active : (selected ?? barIdx.at(-1) ?? 0);
  const hits = useRef(new Map<number, SVGRectElement>());
  const onKey = (e: KeyboardEvent, i: number) => {
    if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(i); return; }
    const pos = barIdx.indexOf(i);
    const next = rovingIndex(e.key, pos, barIdx.length);
    if (next === null) return;
    e.preventDefault();
    const ni = barIdx[next];
    setActive(ni);
    hits.current.get(ni)?.focus();
  };
  const tipIdx = hover ?? focusIdx;
  const sel = selected ?? null;
  return (
    <div ref={ref} className="viz-frame">
      <svg {...svgBox(W, H, measured)} role="group" aria-label={`${unit}: ${data.length} × ${data.length > 1 ? `${data[0].tip} – ${data.at(-1)!.tip}` : ''}`} onPointerLeave={() => setHover(null)}>
        <Textures uid={uid} />
        {ticks.map((t) => (
          <g key={t}><line className="viz-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} /><text className="viz-axis" x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmtN(t, locale)}</text></g>
        ))}
        {slots.map((s, si) => {
          if (s.type === 'gap') {
            const gx = slotX[si];
            const span = `${data[s.from].tip} – ${data[s.to].tip}`;
            const z = y(0);
            return (
              <g key={`gap-${s.from}`} className="viz-break">
                <title>{`${span}: 0 ${unit}`}</title>
                <path d={`M${gx + 5},${z + 6} l4,-8 l4,8 l4,-8 l4,8`} />
                <text className="viz-axis viz-break__label" x={gx + GAP_W / 2} y={m.t + ih / 2} textAnchor="middle" transform={`rotate(-90 ${gx + GAP_W / 2} ${m.t + ih / 2})`}>{`${data[s.from].tip} – ${data[s.to].tip}`}</text>
              </g>
            );
          }
          const i = s.i;
          const d = data[i];
          const x = slotX[si] + (band - bw) / 2;
          const present = shownSeries.filter((k) => (d.counts[k] ?? 0) > 0);
          let acc = 0;
          const isFocus = focusIdx === i;
          return (
            <g key={d.key} className={(hover ?? sel ?? i) !== i ? 'viz-dim' : undefined}>
              {sel === i && <rect className="viz-selected" x={x - 1} y={y(0) + 3} width={bw + 2} height={3} rx={1.5} />}
              {present.map((k, j) => {
                const y1 = y(acc);
                acc += d.counts[k];
                const y0 = y(acc);
                const p = barPath(x, y0, bw, Math.max(0, y1 - y0 - (j > 0 ? 2 : 0)), j === present.length - 1);
                const tex = TEXTURES[series.indexOf(k) % TEXTURES.length];
                return <g key={k}><path className={fill(k)} d={p} /><path className="viz-texture" fill={`url(#${uid}-${tex})`} d={p} /></g>;
              })}
              {sel === i && total(d) > 0 && <text className="viz-label viz-label--strong viz-bar-total" x={x + bw / 2} y={y(total(d)) - 5} textAnchor="middle">{fmtN(total(d), locale)}</text>}
              {d.label && (every === 1 || barIdx.indexOf(i) % every === 0) && <text className="viz-axis" x={x + bw / 2} y={m.t + ih + 16} textAnchor="middle">{d.label}</text>}
              {isFocus && <rect className="viz-focus" x={slotX[si] + 1} y={m.t - 2} width={band - 2} height={ih + 4} rx={4} />}
              <rect ref={(el) => { if (el) hits.current.set(i, el); else hits.current.delete(i); }}
                className="viz-hit" x={slotX[si]} y={m.t} width={band} height={ih} tabIndex={i === activeIdx ? 0 : -1}
                aria-label={`${d.tip}: ${total(d)} ${unit}${markers.some((mk) => mk.key === d.key) ? ` · ${markers.filter((mk) => mk.key === d.key).map((mk) => mk.label).join('; ')}` : ''}`}
                {...(onSelect ? { role: 'button', 'aria-pressed': sel === i, onClick: () => { setActive(i); onSelect(i); } } : {})}
                onKeyDown={(e) => onKey(e, i)}
                onPointerEnter={() => setHover(i)} onFocus={() => { setFocusIdx(i); setActive(i); }} onBlur={() => setFocusIdx(null)} />
            </g>
          );
        })}
        {markers.map((mk) => {
          const i = data.findIndex((d) => d.key === mk.key);
          const pos = i < 0 ? undefined : xOf.get(i);
          if (!pos) return null;
          const xx = pos.x + pos.w / 2;
          return <g key={`${mk.key}-${mk.label}`} className="viz-event" pointerEvents="none"><title>{mk.label}</title><line x1={xx} x2={xx} y1={m.t} y2={y(0)} /><circle cx={xx} cy={m.t} r={3} /></g>;
        })}
        <line className="viz-baseline" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        {months && yearSpans(slots.map((s) => (s.type === 'bar' ? data[s.i].key : null))).map((ys) => {
          const x0 = slotX[ys.from] + 2;
          const x1 = slotX[ys.to] + (slots[ys.to].type === 'bar' ? band : GAP_W) - 2;
          const yy = m.t + ih + 24;
          return (
            <g key={ys.year} className="viz-year">
              <path d={`M${x0},${yy - 4}V${yy}H${x1}V${yy - 4}`} />
              <text className="viz-axis" x={(x0 + x1) / 2} y={yy + 13} textAnchor="middle">{ys.year}</text>
            </g>
          );
        })}
        {tipIdx !== null && data[tipIdx] && xOf.get(tipIdx) && (
          <Tooltip x={xOf.get(tipIdx)!.x + xOf.get(tipIdx)!.w / 2} y={y(total(data[tipIdx]))} w={W} h={H} title={data[tipIdx].tip}
            lines={[...markers.filter((mk) => mk.key === data[tipIdx].key).map((mk) => ({ value: '◆', label: short(mk.label) })),
              { value: fmtN(total(data[tipIdx]), locale), label: unit },
              ...[...shownSeries].reverse().filter((k) => (data[tipIdx].counts[k] ?? 0) > 0).map((k) => ({ cls: stroke(k), value: fmtN(data[tipIdx].counts[k], locale), label: seriesLabel(k) }))]} />
        )}
      </svg>
    </div>
  );
}

export interface LinePt { date: string; value: number; sub?: string }

/** A step line over dates with a crosshair; one tab stop, arrow keys move the crosshair. Markers are event hairlines. */
export function LineChart({ points, locale, height = 220, unit, markers = [] }: { points: LinePt[]; locale: Locale; height?: number; unit: string; markers?: readonly Marker[] }) {
  const [ref, W, measured] = useWidth(640);
  const [hover, setHover] = useState<number | null>(null);
  const H = W > 900 ? Math.round(Math.min(height * 1.3, Math.max(height, W * 0.2))) : height;
  const m = { t: 12, r: 14, b: 26, l: 44 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const t0 = Date.parse(`${points[0].date}T00:00:00Z`);
  const t1 = Math.max(t0 + 86_400_000, Date.parse(`${points.at(-1)!.date}T00:00:00Z`));
  const x = (d: string) => m.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * iw;
  const ticks = niceTicks(Math.max(...points.map((p) => p.value)));
  const top = ticks.at(-1)!;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  // Step line: a total holds until the next day that changes it.
  const d = points.map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.value)}` : `H${x(p.date)}V${y(p.value)}`)).join('');
  const a = new Date(t0);
  const b = new Date(t1);
  const monthsN = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  const step = Math.max(1, Math.ceil(monthsN / Math.max(2, Math.floor(iw / 64))));
  const xTicks: string[] = [];
  for (let i = 1; i <= monthsN; i += step) xTicks.push(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const px = (e.clientX - (e.currentTarget.ownerSVGElement?.getBoundingClientRect().left ?? 0)) * (measured ? 1 : W / (e.currentTarget.ownerSVGElement?.getBoundingClientRect().width || W));
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setHover(best);
  };
  const onKey = (e: KeyboardEvent) => {
    const next = rovingIndex(e.key, hover ?? points.length - 1, points.length);
    if (next === null) return;
    e.preventDefault();
    setHover(next);
  };
  const hp = hover !== null ? points[hover] : null;
  const [focused, setFocused] = useState(false);
  return (
    <div ref={ref} className="viz-frame">
      <svg {...svgBox(W, H, measured)} role="group" aria-label={`${unit}: ${fmtN(points.at(-1)!.value, locale)}`}>
        {ticks.map((t) => (
          <g key={t}><line className="viz-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} /><text className="viz-axis" x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmtN(t, locale)}</text></g>
        ))}
        {xTicks.map((ym, i) => {
          const xx = x(`${ym}-01`);
          return xx > m.l + 14 && xx < W - m.r - 14
            ? <text key={ym} className="viz-axis" x={xx} y={H - 8} textAnchor="middle">{fmtMonth(ym, locale, i === 0 || ym.endsWith('-01') || step > 1)}</text>
            : null;
        })}
        {markers.map((mk) => {
          const tt = Date.parse(`${mk.key}T00:00:00Z`);
          if (tt < t0 || tt > t1) return null;
          const xx = x(mk.key);
          return <g key={`${mk.key}-${mk.label}`} className="viz-event" pointerEvents="none"><title>{mk.label}</title><line x1={xx} x2={xx} y1={m.t} y2={y(0)} /><circle cx={xx} cy={m.t} r={3} /></g>;
        })}
        <line className="viz-baseline" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path className="viz-line" d={d} />
        {points.length <= 40 && points.map((p) => <circle key={p.date} className="viz-dot" cx={x(p.date)} cy={y(p.value)} r={4} />)}
        {hp && (
          <g pointerEvents="none">
            <line className="viz-cross" x1={x(hp.date)} x2={x(hp.date)} y1={m.t} y2={y(0)} />
            <circle className="viz-dot viz-dot--on" cx={x(hp.date)} cy={y(hp.value)} r={5} />
          </g>
        )}
        {focused && <rect className="viz-focus" x={m.l - 6} y={m.t - 4} width={iw + 12} height={ih + 8} rx={6} />}
        <rect className="viz-hit" x={m.l - 8} y={m.t} width={iw + 16} height={ih} tabIndex={0}
          aria-label={hp ? `${fmtDay(hp.date, locale)}: ${fmtN(hp.value, locale)} ${unit}` : `${unit}: ${fmtN(points.at(-1)!.value, locale)}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} onKeyDown={onKey}
          onFocus={() => { setFocused(true); setHover(points.length - 1); }} onBlur={() => { setFocused(false); setHover(null); }} />
        {hp && <Tooltip x={x(hp.date)} y={y(hp.value)} w={W} h={H} title={fmtDay(hp.date, locale)}
          lines={[{ value: fmtN(hp.value, locale), label: unit }, ...(hp.sub ? [{ value: hp.sub, label: '' }] : []),
            ...markers.filter((mk) => mk.key === hp.date).map((mk) => ({ value: '◆', label: short(mk.label) }))]} />}
      </svg>
    </div>
  );
}

export interface HBarRow { key: string; label: string; n: number; cls?: string; sub?: string }

/** Ranked horizontal bars with the value at the end; one color unless rows carry their own class. Optional selection. */
export function HBars({ rows, locale, labelWidth = 150, selected, onSelect, unit, hidden }: {
  rows: HBarRow[]; locale: Locale; labelWidth?: number; selected?: string | null; onSelect?: (key: string) => void; unit: string; hidden?: ReadonlySet<string>;
}) {
  const [ref, W, measured] = useWidth(420);
  const visible = hidden ? rows.filter((r) => !hidden.has(r.key)) : rows;
  const max = Math.max(1, ...visible.map((r) => r.n));
  // Room for the longest value label ("44 9 akun"), so it is never clipped at the right edge.
  const vw = Math.max(64, ...visible.map((r) => measureText(`${fmtN(r.n, locale)}${r.sub ? ` ${r.sub}` : ''}`, 12.5, 600, measured) + 14));
  const narrow = W < 460;
  const lw = narrow ? 0 : Math.min(labelWidth, W * 0.4);
  const rh = narrow ? 46 : 32;
  const iw = Math.max(40, W - lw - vw);
  const height = visible.length * rh + 4;
  const fit = (s: string) => (lw && measureText(s, 12.5, 400, measured) > lw - 8 ? `${s.slice(0, Math.max(4, Math.floor((lw - 8) / 7) - 1))}…` : s);
  const [active, setActive] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const hits = useRef(new Map<number, SVGRectElement>());
  const activeIdx = Math.min(active, Math.max(0, visible.length - 1));
  const onKey = (e: KeyboardEvent, i: number, key: string) => {
    if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(key); return; }
    const next = rovingIndex(e.key, i, visible.length);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    hits.current.get(next)?.focus();
  };
  return (
    <div ref={ref} className="viz-frame">
      <svg {...svgBox(W, height, measured)} role={onSelect ? 'group' : 'img'} aria-label={visible.map((r) => `${r.label} ${r.n}`).join(', ')}>
        {visible.map((r, i) => {
          const w = (r.n / max) * iw;
          const rad = Math.min(4, w);
          const yy = i * rh + (narrow ? 20 : 6);
          return (
            <g key={r.key} className={selected && selected !== r.key ? 'viz-dim' : undefined}>
              <text className="viz-label viz-label--sans" x={0} y={narrow ? yy - 5 : yy + 14}><title>{r.label}</title>{fit(r.label)}</text>
              <rect className="viz-track" x={lw} y={yy + 2} width={iw} height={16} rx={4} />
              {w > 0 && <path className={r.cls ?? 'viz-fill--one'} d={`M${lw},${yy + 2}H${lw + w - rad}Q${lw + w},${yy + 2} ${lw + w},${yy + 2 + rad}V${yy + 18 - rad}Q${lw + w},${yy + 18} ${lw + w - rad},${yy + 18}H${lw}Z`} />}
              <text className="viz-label viz-label--strong" x={lw + iw + 8} y={yy + 14}>{fmtN(r.n, locale)}{r.sub && <tspan className="viz-tip__lab"> {r.sub}</tspan>}</text>
              {focusKey === r.key && <rect className="viz-focus" x={1} y={i * rh + 1} width={W - 2} height={rh - 2} rx={4} />}
              {onSelect && <rect ref={(el) => { if (el) hits.current.set(i, el); else hits.current.delete(i); }}
                className="viz-hit viz-hit--pointer" x={0} y={i * rh} width={W} height={rh} tabIndex={i === activeIdx ? 0 : -1} role="button"
                aria-pressed={selected === r.key} aria-label={`${r.label}: ${r.n} ${unit}`}
                onClick={() => { setActive(i); onSelect(r.key); }} onKeyDown={(e) => onKey(e, i, r.key)}
                onFocus={() => { setFocusKey(r.key); setActive(i); }} onBlur={() => setFocusKey(null)} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A tiny trend line for a stat tile; values in time order. The tile's own number carries the value, so no tooltip. */
export function Sparkline({ values, label, width = 112, height = 26 }: { values: readonly number[]; label: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const x = (i: number) => 1 + (i / (values.length - 1)) * (width - 2);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = values.length - 1;
  return (
    <svg className="viz-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path className="viz-spark__line" d={d} />
      <circle className="viz-spark__dot" cx={x(last)} cy={y(values[last])} r={2.4} />
    </svg>
  );
}

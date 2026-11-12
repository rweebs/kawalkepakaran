// Fomo-specific chart pieces for the Fomo section of /pantau (aegis review fixes):
// - SegmentedColumns: month columns with long empty stretches cut out (gap marker), shared y scale, undated bar at the end,
//   one keyboard stop (arrow keys move, Enter selects) and a live text readout.
// - CompanyRank: company badges ranked by accounts; badge-reading confidence as fill (solid = page text, hollow =
//   screenshot only, hatched = flagged uncertain); a dot plot on phones; n=1 rows greyed; expandable to all companies.
// - ThreadMatrix: account x thread heatmap for accounts active in 2+ threads; generic handles marked.
// - ParetoCurve: cumulative share of posts by accounts.
// - InlineBar / RangeBar / LengthSpark: small marks for tables and posts.
// Every piece is SVG measured to its container; no style attributes.
import { useId, useState, type KeyboardEvent } from 'react';
import { fmtMonth, fmtN, niceTicks, useWidth, type Locale } from './viz/charts';
import type { CompanyRow, MatrixRow, Pareto, Segment } from '../lib/fomo';

// ---------- SegmentedColumns ----------
export interface ColMonth<K extends string> { key: string; counts: Record<K, number>; total: number }

export function SegmentedColumns<K extends string>({ segments, undated, series, fill, seriesLabel, locale, unit, selected, onSelect, height = 220, labels }: {
  segments: Segment<ColMonth<K>>[]; undated: number; series: readonly K[]; fill: (k: K) => string; seriesLabel: (k: K) => string;
  locale: Locale; unit: string; selected: string | null; onSelect?: (key: string | null) => void; height?: number;
  labels: { gap: (n: number) => string; undated: string; readout: (title: string, total: number, parts: string) => string; hint: string };
}) {
  const [ref, W] = useWidth(640);
  const [active, setActive] = useState<number | null>(null);
  const cols: { kind: 'm'; m: ColMonth<K> }[] = segments.flatMap((s) => s.months.map((m) => ({ kind: 'm' as const, m })));
  const gaps = segments.filter((s, i) => i > 0 && s.gapBefore > 0).length;
  const GAP = 34;
  const m = { t: 12, r: 6, b: 40, l: 36 };
  const extra = undated > 0 ? 1 : 0;
  const slots = cols.length + extra;
  const iw = W - m.l - m.r - gaps * GAP - (extra ? 10 : 0);
  const band = iw / Math.max(1, slots);
  const bw = Math.max(3, Math.min(30, band - 3));
  const ih = height - m.t - m.b;
  const ticks = niceTicks(Math.max(1, undated, ...cols.map((c) => c.m.total)));
  const top = ticks.at(-1)!;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  // x position of every column, with the gap markers between segments.
  const xs: number[] = [];
  const gapXs: { x: number; n: number }[] = [];
  let x = m.l;
  segments.forEach((s, si) => {
    if (si > 0 && s.gapBefore > 0) { gapXs.push({ x: x + GAP / 2, n: s.gapBefore }); x += GAP; }
    for (let i = 0; i < s.months.length; i++) { xs.push(x); x += band; }
  });
  const undatedX = x + 10;
  const items = [...cols.map((c) => ({ key: c.m.key, total: c.m.total, counts: c.m.counts as Record<K, number> | null, title: fmtMonth(c.m.key, locale, true) })),
    ...(extra ? [{ key: '__undated', total: undated, counts: null, title: labels.undated }] : [])];
  const cur = active !== null ? items[active] : selected ? items.find((it) => it.key === selected) ?? null : null;
  const parts = (c: Record<K, number> | null) => (c ? series.filter((k) => c[k] > 0).map((k) => `${fmtN(c[k], locale)} ${seriesLabel(k)}`).join(', ') : '');
  const onKey = (e: KeyboardEvent) => {
    const i = active ?? Math.max(0, items.findIndex((it) => it.key === selected));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive(Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if ((e.key === 'Enter' || e.key === ' ') && onSelect && active !== null && items[active].key !== '__undated') {
      e.preventDefault();
      onSelect(items[active].key === selected ? null : items[active].key);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : items.length - 1);
    }
  };
  return (
    <div ref={ref} className="viz-frame">
      <svg width={W} height={height} role="group" aria-label={labels.hint} tabIndex={0} className="fm-cols" onKeyDown={onKey}
        onBlur={() => setActive(null)} onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => <g key={t}><line className="viz-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} /><text className="viz-axis" x={m.l - 6} y={y(t) + 4} textAnchor="end">{fmtN(t, locale)}</text></g>)}
        {cols.map((c, i) => {
          const cx = xs[i] + (band - bw) / 2;
          let acc = 0;
          const present = series.filter((k) => c.m.counts[k] > 0);
          const on = (active ?? -1) === i || selected === c.m.key;
          const firstOfYear = c.m.key.endsWith('-01') || i === 0 || segments.some((s) => s.months[0] === c.m);
          return (
            <g key={c.m.key} className={selected && selected !== c.m.key && active !== i ? 'viz-dim' : undefined}>
              {present.map((k, j) => {
                const y1 = y(acc);
                acc += c.m.counts[k];
                const y0 = y(acc);
                return <rect key={k} className={fill(k)} x={cx} y={y0} width={bw} height={Math.max(0, y1 - y0 - (j > 0 ? 2 : 0))} rx={j === present.length - 1 ? 3 : 0} />;
              })}
              {on && <rect className="viz-selected" x={cx - 1} y={y(0) + 3} width={bw + 2} height={3} rx={1.5} />}
              {firstOfYear && <text className="viz-axis" x={cx + bw / 2} y={height - 22} textAnchor="middle">{fmtMonth(c.m.key, locale, true)}</text>}
              <rect className="viz-hit viz-hit--pointer" x={xs[i]} y={m.t} width={band} height={ih} onPointerEnter={() => setActive(i)}
                onClick={() => onSelect?.(selected === c.m.key ? null : c.m.key)}><title>{`${fmtMonth(c.m.key, locale, true)}: ${fmtN(c.m.total, locale)} ${unit}`}</title></rect>
            </g>
          );
        })}
        {gapXs.map((g) => (
          <g key={g.x} className="fm-gap" aria-hidden="true">
            <line x1={g.x - 6} x2={g.x - 2} y1={y(0) + 6} y2={y(0) - 6} /><line x1={g.x + 2} x2={g.x + 6} y1={y(0) + 6} y2={y(0) - 6} />
            <text className="viz-axis" x={g.x} y={height - 6} textAnchor="middle">{labels.gap(g.n)}</text>
          </g>
        ))}
        {extra > 0 && (
          <g>
            <rect className="fm-fill--undated" x={undatedX + (band - bw) / 2} y={y(undated)} width={bw} height={y(0) - y(undated)} rx={3} />
            <text className="viz-axis" x={undatedX + band / 2} y={height - 22} textAnchor="middle">{labels.undated}</text>
            <rect className="viz-hit" x={undatedX} y={m.t} width={band} height={ih} onPointerEnter={() => setActive(items.length - 1)}><title>{`${labels.undated}: ${undated}`}</title></rect>
          </g>
        )}
        <line className="viz-baseline" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
      </svg>
      <p className="fm-readout" aria-live="polite">{cur ? labels.readout(cur.title, cur.total, parts(cur.counts)) : labels.hint}</p>
    </div>
  );
}

// ---------- CompanyRank ----------
export function CompanyRank({ rows, locale, selected, onSelect, limit, labels }: {
  rows: CompanyRow[]; locale: Locale; selected: string | null; onSelect: (c: string) => void; limit: number;
  labels: { accounts: (n: number) => string; posts: (n: number) => string; n1: string; conf: { teks: string; gambar: string; ragu: string } };
}) {
  const [ref, W] = useWidth(560);
  const uid = useId().replace(/:/g, '');
  const shown = rows.slice(0, limit);
  if (selected && !shown.some((r) => r.perusahaan === selected)) {
    const r = rows.find((x) => x.perusahaan === selected);
    if (r) shown.push(r);
  }
  const narrow = W < 480;
  const lw = narrow ? Math.min(130, W * 0.38) : 180;
  const vw = narrow ? 64 : 150;
  const rh = narrow ? 28 : 30;
  const iw = Math.max(40, W - lw - vw - 8);
  const max = Math.max(1, ...rows.map((r) => r.akun));
  const x = (v: number) => lw + (v / max) * iw;
  const fit = (s: string) => (s.length * 7 > lw - 8 ? `${s.slice(0, Math.max(4, Math.floor((lw - 8) / 7) - 1))}…` : s);
  return (
    <div ref={ref} className="viz-frame">
      <svg width={W} height={shown.length * rh + 6} role="group" aria-label={`${shown.length} / ${rows.length}`}>
        <defs>
          <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <rect width="5" height="5" className="fm-hatch-bg" /><line x1="0" y1="0" x2="0" y2="5" className="fm-hatch-line" />
          </pattern>
        </defs>
        {shown.map((r, i) => {
          const yy = i * rh + 4;
          const n1 = r.akun < 2;
          const dim = selected && selected !== r.perusahaan;
          const segs = (['teks', 'gambar', 'ragu'] as const).filter((k) => r.conf[k] > 0);
          let acc = 0;
          return (
            <g key={r.perusahaan} className={[n1 ? 'fm-n1' : '', dim ? 'viz-dim' : ''].join(' ').trim() || undefined}>
              <text className="viz-label viz-label--sans" x={0} y={yy + rh / 2 + 2}><title>{r.perusahaan}</title>{fit(r.perusahaan)}</text>
              {!narrow && <rect className="viz-track" x={lw} y={yy + rh / 2 - 8} width={iw} height={14} rx={3} />}
              {narrow ? (
                <>
                  <line className="fm-dotline" x1={lw} x2={x(r.akun)} y1={yy + rh / 2 - 1} y2={yy + rh / 2 - 1} />
                  <circle className={r.conf.ragu ? 'fm-conf--ragu' : r.conf.gambar && !r.conf.teks ? 'fm-conf--gambar' : 'fm-conf--teks'} cx={x(r.akun)} cy={yy + rh / 2 - 1} r={5}
                    fill={r.conf.ragu ? `url(#${uid}-hatch)` : undefined} />
                </>
              ) : segs.map((k) => {
                const x0 = x(acc);
                acc += r.conf[k];
                const w = Math.max(1, x(acc) - x0 - 1);
                return <rect key={k} className={`fm-conf--${k}`} x={x0 + 0.5} y={yy + rh / 2 - 7.5} width={w} height={13} rx={2} fill={k === 'ragu' ? `url(#${uid}-hatch)` : undefined}><title>{`${labels.conf[k]}: ${r.conf[k]}`}</title></rect>;
              })}
              <text className="viz-label viz-label--strong" x={lw + iw + 8} y={yy + rh / 2 + 2}>
                {fmtN(r.akun, locale)}{!narrow && <tspan className="viz-tip__lab"> {labels.accounts(r.akun).replace(/^\S+\s/, '')} · {labels.posts(r.posts)}</tspan>}{n1 && <tspan className="viz-tip__lab"> {labels.n1}</tspan>}
              </text>
              <rect className="viz-hit viz-hit--pointer" x={0} y={yy} width={W} height={rh} tabIndex={0} role="button" aria-pressed={selected === r.perusahaan}
                aria-label={`${r.perusahaan}: ${labels.accounts(r.akun)}, ${labels.posts(r.posts)}`}
                onClick={() => onSelect(r.perusahaan)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.perusahaan); } }} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- ThreadMatrix ----------
export function ThreadMatrix({ rows, threads, max, locale, onAccount, labels }: {
  rows: MatrixRow[]; threads: number[]; max: number; locale: Locale; onAccount: (akun: string) => void;
  labels: { generic: string; cell: (akun: string, thread: number, n: number) => string; thread: string };
}) {
  const cell = 15;
  const lw = 116;
  const head = 26;
  const W = lw + threads.length * cell + 8;
  const H = head + rows.length * cell + 4;
  const bin = (n: number) => (n <= 0 ? 0 : Math.min(5, Math.ceil((n / Math.max(1, max)) * 5)));
  return (
    <div className="viz-scroll fm-matrix">
      <svg width={W} height={H} role="group" aria-label={`${rows.length} × ${threads.length}`}>
        {threads.map((t, j) => <text key={t} className="viz-axis" x={lw + j * cell + cell / 2} y={head - 8} textAnchor="middle">{t}</text>)}
        {rows.map((r, i) => (
          <g key={r.akun}>
            <text className={`viz-label fm-matrix__name${r.generic ? ' fm-generic' : ''}`} x={lw - 6} y={head + i * cell + cell - 4} textAnchor="end">
              <title>{r.generic ? `${r.akun}: ${labels.generic}` : r.akun}</title>{r.akun.length > 15 ? `${r.akun.slice(0, 14)}…` : r.akun}
            </text>
            <rect className="viz-hit viz-hit--pointer" x={0} y={head + i * cell} width={lw} height={cell} tabIndex={0} role="button" aria-label={`${r.akun}: ${r.total} ${labels.thread} ${r.threads}`}
              onClick={() => onAccount(r.akun)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAccount(r.akun); } }} />
            {threads.map((t, j) => {
              const n = r.perThread[t] ?? 0;
              return <rect key={t} className={`fm-heat fm-heat--${bin(n)}`} x={lw + j * cell + 1} y={head + i * cell + 1} width={cell - 2} height={cell - 2} rx={2}>
                {n > 0 && <title>{labels.cell(r.akun, t, n)}</title>}
              </rect>;
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------- ParetoCurve ----------
export function ParetoCurve({ data, locale, labels }: { data: Pareto; locale: Locale; labels: { x: string; y: string; even: string } }) {
  const [ref, W] = useWidth(480);
  const H = 220;
  const m = { t: 10, r: 12, b: 34, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (v: number) => m.l + (v / 100) * iw;
  const y = (v: number) => m.t + ih - (v / 100) * ih;
  const d = data.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.accounts).toFixed(1)},${y(p.posts).toFixed(1)}`).join('');
  const tenX = data.accounts ? (10 / data.accounts) * 100 : 0;
  const tenY = data.topTenShare;
  return (
    <div ref={ref} className="viz-frame">
      <svg width={W} height={H} role="img" aria-label={`${labels.y}: ${data.topTenShare}%`}>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line className="viz-grid" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
            <text className="viz-axis" x={m.l - 6} y={y(t) + 4} textAnchor="end">{t}%</text>
            <text className="viz-axis" x={x(t)} y={H - 18} textAnchor="middle">{t}%</text>
          </g>
        ))}
        <line className="fm-even" x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)}><title>{labels.even}</title></line>
        <path className="viz-line" d={d} />
        {tenX > 0 && <><line className="viz-cross" x1={x(tenX)} x2={x(tenX)} y1={y(0)} y2={y(tenY)} /><circle className="viz-dot" cx={x(tenX)} cy={y(tenY)} r={4} />
          <text className="viz-label viz-label--strong" x={x(tenX) + 8} y={y(tenY) + 4}>{fmtN(tenY, locale)}%</text></>}
        <text className="viz-axis" x={m.l + iw / 2} y={H - 3} textAnchor="middle">{labels.x}</text>
      </svg>
    </div>
  );
}

// ---------- small marks ----------
export function InlineBar({ value, max, label }: { value: number; max: number; label: string }) {
  const w = 64;
  return <svg width={w} height={8} className="fm-inline" role="img" aria-label={label}><rect className="viz-track" width={w} height={8} rx={2} /><rect className="viz-fill--one" width={Math.max(2, (value / Math.max(1, max)) * w)} height={8} rx={2} /></svg>;
}

export function RangeBar({ from, to, min, max, label }: { from: string | null; to: string | null; min: string; max: string; label: string }) {
  const w = 96;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  if (!from) return <span>–</span>;
  const span = Math.max(1, t(max) - t(min));
  const x0 = ((t(from) - t(min)) / span) * w;
  const x1 = ((t(to ?? from) - t(min)) / span) * w;
  return <svg width={w} height={8} className="fm-inline" role="img" aria-label={label}><rect className="viz-track" width={w} height={8} rx={2} /><rect className="fm-range" x={x0} width={Math.max(3, x1 - x0)} height={8} rx={2} /></svg>;
}

export function LengthSpark({ chars, max, label }: { chars: number; max: number; label: string }) {
  const w = 44;
  return <svg width={w} height={6} className="fm-inline" role="img" aria-label={label}><rect className="viz-track" width={w} height={6} rx={2} /><rect className="fm-len" width={Math.max(2, (Math.min(chars, max) / Math.max(1, max)) * w)} height={6} rx={2} /></svg>;
}

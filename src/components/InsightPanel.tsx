// The insight list shared by the /pantau panels: one headline answer, then findings labelled fact or inference.
// Same markup and classes as the sitemap panel (.viz-ins), so every section reads the same way.
import type { ReactNode } from 'react';

export type Kind = 'fact' | 'inference';
export interface Insight { id: string; kind: Kind; text: ReactNode; detail?: ReactNode }
export type Locale = 'id' | 'en';

const KIND = { id: { fact: 'Fakta', inference: 'Dugaan' }, en: { fact: 'Fact', inference: 'Inference' } } as const;

export const fmtN = (n: number, l: Locale) => new Intl.NumberFormat(l === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 1 }).format(n);
export const fmtDay = (d: string, l: Locale) =>
  new Intl.DateTimeFormat(l === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`));
export const fmtMonthYear = (ym: string, l: Locale) =>
  new Intl.DateTimeFormat(l === 'id' ? 'id-ID' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));

export function InsightPanel({ id, title, headline, items, locale, empty, children }: {
  id: string; title: string; headline: ReactNode; items: Insight[]; locale: Locale; empty: string; children?: ReactNode;
}) {
  return (
    <section className="viz-ins pi-panel" aria-labelledby={id}>
      <h3 id={id} className="viz-ins__title">{title}</h3>
      <p className="viz-ins__headline" aria-live="polite">{headline}</p>
      {children}
      {items.length === 0 ? <p className="muted">{empty}</p> : (
        <ul className="viz-ins__list">
          {items.map((it) => (
            <li key={it.id} className={`viz-ins__item viz-ins__item--${it.kind}`}>
              <span className={`viz-ins__kind viz-ins__kind--${it.kind}`}>{KIND[locale][it.kind]}</span>
              <div><p>{it.text}</p>{it.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Seven thin bars, Monday first, with the busiest day labelled. Tiny, so no tooltip; the numbers are in the text. */
export function WeekdayBars({ counts, labels, label }: { counts: readonly number[]; labels: readonly string[]; label: string }) {
  const max = Math.max(1, ...counts);
  const W = 7 * 34;
  const H = 54;
  return (
    <svg className="pi-week" width={W} height={H + 16} viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`${label}: ${labels.map((l, i) => `${l} ${counts[i]}`).join(', ')}`}>
      {counts.map((c, i) => {
        const h = Math.max(c ? 2 : 0, (c / max) * H);
        return (
          <g key={i}>
            <rect className={c === max ? 'pi-week__bar pi-week__bar--max' : 'pi-week__bar'} x={i * 34 + 6} y={H - h} width={22} height={h} rx={3} />
            <text className="viz-axis" x={i * 34 + 17} y={H + 13} textAnchor="middle">{labels[i].slice(0, 3)}</text>
          </g>
        );
      })}
    </svg>
  );
}

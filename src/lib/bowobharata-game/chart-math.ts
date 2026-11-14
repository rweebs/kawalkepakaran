// The charts' arithmetic, pure: dates to days and months, a tidy axis maximum, positions on a time span, month ticks.
// Dates are read as UTC calendar days, so a result never depends on the viewer's time zone.

export const DAY_MS = 86_400_000;

/** Days since 1970-01-01 UTC of an ISO day ('YYYY-MM-DD'; a month key counts as its first day). */
export function dayNumber(iso: string): number {
  const [y, m = 1, d = 1] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** The UTC midnight of an ISO day (or month key, as its first day) as a Date. */
export const utcDate = (iso: string): Date => new Date(dayNumber(iso) * DAY_MS);

/** year × 12 + month − 1 of a 'YYYY-MM' key (or the month of a longer ISO date). */
export function monthIndex(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + m - 1;
}

/** The least of 1, 2 or 5 × 10^k that is at least `n`; 1 for n ≤ 1. */
export function niceMax(n: number): number {
  if (!(n > 1)) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const f of [1, 2, 5, 10]) if (f * pow >= n) return f * pow;
  return 10 * pow;
}

/** Where `iso` falls along a span, 0 to `width`, clamped at both ends. A span of no length puts everything at 0. */
export function xOf(iso: string, span: { from: string; to: string }, width: number): number {
  const a = dayNumber(span.from);
  const len = dayNumber(span.to) - a;
  if (len <= 0) return 0;
  const t = (dayNumber(iso) - a) / len;
  return Math.min(width, Math.max(0, t * width));
}

/** Rounds to 0.1, so the markup is stable. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Month keys ('YYYY-MM') to label an axis from `from` to `to`, at most `max`. A span of 18 months or more gets Januaries only,
 * from the first one in range; a shorter span gets months. Either is thinned to every nth tick until at most `max` remain.
 */
export function monthTicks(from: string, to: string, max: number): string[] {
  const a = monthIndex(from);
  const b = monthIndex(to);
  if (max < 1 || b < a) return [];
  const key = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
  const long = b - a + 1 >= 18;
  const first = long ? Math.ceil(a / 12) * 12 : a;
  const pool: number[] = [];
  for (let i = first; i <= b; i += long ? 12 : 1) pool.push(i);
  let step = 1;
  while (Math.ceil(pool.length / step) > max) step += 1;
  return pool.filter((_, k) => k % step === 0).map(key);
}

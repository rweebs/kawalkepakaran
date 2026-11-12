// Data and layout for the /pantau fullscreen 3D stage. Pure and browser-safe (no three.js here), so it is tested
// directly and the heavy scene module only does drawing.
//
// The picture: a gold vertical spine is Rahmat Wibowo over time (Sep 2023 at the bottom, Nov 2026 at the top). Every
// item sits at the height of its own date and draws a line in to the spine; his legal steps point outward.

export const KINDS = ['site', 'fomo', 'act', 'resp', 'against'] as const;
export type Kind = (typeof KINDS)[number];

/** One dated thing on the stage. `d` is a YYYY-MM-DD day (month-only dates sit on the 15th). */
export interface StageItem { k: Kind; d: string; g: string; t: string; x: string; href?: string }

export interface StageInput {
  site: { path: string; idDate: string | null; section: string }[];
  fomo: { iso: string | null; akun: string; perusahaan: string | null; teks: string; thread: number }[];
  kronologis: { iso: string | null; precision: string; jenis: string; terlapor: string[]; peristiwa: string }[];
  laporan: { no: string; nomor: string; tanggal: string | null; arah: string; pelapor: string | null; terlapor: string[] }[];
  terlaporNames: Record<string, string>;
  siteOrigin: string;
}

const MAX_TEXT = 700;
const clip = (s: string, n = MAX_TEXT) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A day for a dated row: full days as is, months on the 15th, anything coarser left out (it has no place on the axis). */
export function dayOf(iso: string | null, precision = 'day'): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}$/.test(iso) && precision !== 'year') return `${iso}-15`;
  return null;
}

const PLACEHOLDER = /^(deleteduser|pengguna|anonymous|anonim)$/i;

/** Every dated item from the three sources, oldest first. Kind order breaks ties so redraws are stable. */
export function stageItems(i: StageInput): StageItem[] {
  const out: StageItem[] = [];
  for (const r of i.site) {
    if (!r.idDate) continue;
    const slug = r.path.replace(/^\/[^/]+\//, '').replace(/\/$/, '');
    out.push({ k: 'site', d: r.idDate, g: `${r.section}/`, t: clip(slug, 80), x: r.path, href: `${i.siteOrigin}${r.path}` });
  }
  for (const p of i.fomo) {
    if (!p.iso) continue;
    out.push({ k: 'fomo', d: p.iso, g: PLACEHOLDER.test(p.akun) ? 'akun terhapus' : p.perusahaan ?? 'tanpa lencana', t: p.akun, x: clip(p.teks) });
  }
  for (const r of i.kronologis) {
    const d = dayOf(r.iso, r.precision);
    if (!d) continue;
    const who = r.terlapor.map((id) => i.terlaporNames[id] ?? id).join(', ');
    if (r.jenis === 'Perbuatan') out.push({ k: 'act', d, g: who || '–', t: who || r.jenis, x: clip(r.peristiwa) });
    else if (r.jenis === 'Somasi' || r.jenis === 'Aduan') out.push({ k: 'resp', d, g: r.jenis, t: `${r.jenis}${who ? `: ${who}` : ''}`, x: clip(r.peristiwa) });
  }
  for (const l of i.laporan) {
    const d = dayOf(l.tanggal);
    if (!d) continue;
    const who = l.terlapor.map((id) => i.terlaporNames[id] ?? id).join(', ');
    if (l.arah === 'terhadap-pelapor') out.push({ k: 'against', d, g: 'laporan terhadap Pelapor', t: l.nomor, x: `${l.no}${l.pelapor ? ` · ${l.pelapor}` : ''}` });
    else out.push({ k: 'resp', d, g: 'Laporan polisi', t: l.nomor, x: `${l.no}${who ? ` · ${who}` : ''}` });
  }
  const order = new Map(KINDS.map((k, n) => [k, n]));
  return out.sort((a, b) => a.d.localeCompare(b.d) || order.get(a.k)! - order.get(b.k)! || a.t.localeCompare(b.t));
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/**
 * Height on the spine for each day, in [0, 1]. Half linear time, half item rank, so the empty 2024–2025 stretch shrinks
 * while order and spacing within each wave stay readable. Monotonic: a later day is never lower.
 */
export function timeScale(days: readonly string[]): (d: string) => number {
  const sorted = [...days].sort();
  if (!sorted.length) return () => 0;
  const a = dayNum(sorted[0]);
  const b = Math.max(a + 1, dayNum(sorted.at(-1)!));
  const n = sorted.length;
  return (d: string) => {
    const lin = (dayNum(d) - a) / (b - a);
    let lo = 0;
    let hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < d) lo = mid + 1; else hi = mid; }
    const rank = n > 1 ? lo / (n - 1) : 0;
    return Math.min(1, Math.max(0, 0.5 * lin + 0.5 * rank));
  };
}

/** Sector (degrees) and ring radius per kind: attacks around the outside, his responses on an inner ring. */
export const SECTOR: Record<Kind, { from: number; to: number; r: number }> = {
  site: { from: 0, to: 130, r: 10 },
  fomo: { from: 130, to: 250, r: 10 },
  act: { from: 250, to: 345, r: 8 },
  resp: { from: 0, to: 360, r: 4.5 },
  against: { from: 345, to: 360, r: 6.5 },
};

/** A small, stable hash so a group always lands at the same angle across builds. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

export const HEIGHT = 24;

/** x, y, z for each item: angle from its kind's sector (grouped by `g`), height from its date, a little radial jitter. */
export function layout(items: readonly StageItem[]): Float32Array {
  const y = timeScale(items.map((i) => i.d));
  const pos = new Float32Array(items.length * 3);
  items.forEach((it, n) => {
    const s = SECTOR[it.k];
    const span = s.to - s.from;
    const ang = ((s.from + span * (0.08 + 0.84 * hash(it.g)) + (hash(`${it.t}${n}`) - 0.5) * Math.min(10, span * 0.08)) * Math.PI) / 180;
    const r = s.r + (hash(`${it.x}${n}`) - 0.5) * 1.6;
    pos[n * 3] = Math.cos(ang) * r;
    pos[n * 3 + 1] = (y(it.d) - 0.5) * HEIGHT;
    pos[n * 3 + 2] = Math.sin(ang) * r;
  });
  return pos;
}

/** Index of the first item dated after `day`, for the time slider (items are sorted by day). */
export function countUpTo(items: readonly StageItem[], day: string): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (items[mid].d <= day) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Year boundaries with their height on the spine, for the year rings. */
export function yearMarks(items: readonly StageItem[]): { year: string; y: number }[] {
  if (!items.length) return [];
  const y = timeScale(items.map((i) => i.d));
  const first = Number(items[0].d.slice(0, 4));
  const last = Number(items.at(-1)!.d.slice(0, 4));
  const out: { year: string; y: number }[] = [];
  for (let yr = first; yr <= last; yr++) {
    const d = yr === first ? items[0].d : `${yr}-01-01`;
    out.push({ year: String(yr), y: (y(d) - 0.5) * HEIGHT });
  }
  return out;
}

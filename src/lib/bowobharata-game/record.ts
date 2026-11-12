// The record behind Sanjaya's reports: regroups dossier fields by chapter and date. It adds no facts of its own.
import { parvaEvents, type Parva } from '../bowobharata';
import { kategoriKey, type Perkara, type Terlapor, type TerlaporKronologi } from '../perkara';

export type ChapterId = string;
export interface Window { from: string; to: string }

export function parvaWindow(p: Parva): Window {
  const dates = parvaEvents(p).map((e) => e.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function countedRows(t: Terlapor): TerlaporKronologi[] {
  return t.kronologis.filter((r) => (r.jenis === 'Perbuatan' || r.jenis === 'Tanggapan') && r.iso !== null);
}

const lastDay = (y: number, m: number): string => String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');

/** First and last ISO day a row covers, by its precision. */
function span(row: TerlaporKronologi): Window {
  const iso = row.iso as string;
  if (row.precision === 'month') {
    const [y, m] = iso.split('-');
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay(Number(y), Number(m))}` };
  }
  if (row.precision === 'year') return { from: `${iso}-01-01`, to: `${iso}-12-31` };
  return { from: iso, to: iso };
}

export function rowInWindow(row: TerlaporKronologi, w: Window): boolean {
  if (row.iso === null) return false;
  const s = span(row);
  return s.from <= w.to && s.to >= w.from;
}

export interface SanjayaEntry {
  id: string; nama: string; kategori: string; klaster: string | null; dugaan: string; pasal: string[]; laporan: string[];
  rows: TerlaporKronologi[]; full: boolean;
}
export interface Chapter { id: ChapterId; window: Window | null; entries: SanjayaEntry[] }

const entry = (t: Terlapor, rows: TerlaporKronologi[], full: boolean): SanjayaEntry => ({
  id: t.id, nama: t.nama, kategori: t.kategori, klaster: t.klaster, dugaan: t.dugaan, pasal: t.pasal, laporan: t.laporan, rows, full,
});

export function buildChapters(parvas: Parva[], terlapor: Terlapor[]): Chapter[] {
  const windows = parvas.map(parvaWindow);
  const prologue: Chapter = { id: 'prologue', window: null, entries: [] };
  const chapters: Chapter[] = parvas.map((p, i) => ({ id: p.id, window: windows[i], entries: [] }));
  const finale: Chapter = { id: 'finale', window: null, entries: [] };
  const before = (r: TerlaporKronologi) => windows.length > 0 && span(r).to < windows[0].from;

  for (const t of terlapor) {
    if (kategoriKey(t.kategori) === 'E') continue;
    const rows = countedRows(t);
    const early = rows.filter(before);
    let placed = false;
    if (early.length > 0) {
      prologue.entries.push(entry(t, early, true));
      placed = true;
    }
    chapters.forEach((c, i) => {
      const inWin = rows.filter((r) => rowInWindow(r, windows[i]));
      if (inWin.length === 0) return;
      c.entries.push(entry(t, inWin, !placed));
      placed = true;
    });
    if (!placed) finale.entries.push(entry(t, rows, true));
  }
  return [prologue, ...chapters, finale];
}

export interface Totals { people: number; events: number; reportsBy: number; reportsAgainst: number; excludedE: number }

export function finaleTotals(p: Perkara): Totals {
  const nonE = p.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
  return {
    people: nonE.length,
    events: nonE.reduce((n, t) => n + countedRows(t).length, 0),
    reportsBy: p.laporan.filter((l) => l.arah === 'oleh-pelapor').length,
    reportsAgainst: p.laporan.filter((l) => l.arah === 'terhadap-pelapor').length,
    excludedE: p.terlapor.length - nonE.length,
  };
}

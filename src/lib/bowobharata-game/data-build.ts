// Builds the game's data (the types in data.ts) at build time, from the dossier and the linimasa. Only
// src/lib/pantau-props.ts imports this, to serve /pantau-data/bowobharata-game.json. It adds no facts of its own:
// category E is left out by buildChapters, and the rows keep only the fields the screens read.
import type { Locale } from '../../i18n';
import { PARVAS, parvaEvents } from '../bowobharata';
import { eventPath, formatDateFor, localizeEvent } from '../linimasa-locale';
import type { Perkara, TerlaporKronologi } from '../perkara';
import type { EntryView, EventCard, GameData, PrologueRecord, RowView } from './data';
import { buildChapters, finaleTotals, type SanjayaEntry } from './record';

const rowView = ({ tanggal, iso, peristiwa }: TerlaporKronologi): RowView => ({ tanggal, iso, peristiwa });

/** A name-only entry (a person already reported in an earlier chapter) is shown by name alone, so the rest is dropped. */
function entryView(e: SanjayaEntry): EntryView {
  const { id, nama, full } = e;
  if (!full) return { id, nama, kategori: '', klaster: null, dugaan: '', pasal: [], laporan: [], rows: [], full };
  return { id, nama, kategori: e.kategori, klaster: e.klaster, dugaan: e.dugaan, pasal: e.pasal, laporan: e.laporan, rows: e.rows.map(rowView), full };
}

const perLocale = <T>(f: (locale: Locale) => T): Record<Locale, T> => ({ id: f('id'), en: f('en') });

/** Chapter i's linimasa events in parvaEvents order, in both languages. The prologue (0) and the finale have none. */
export function eventCards(chapterIndex: number): EventCard[] {
  const p = PARVAS[chapterIndex - 1];
  if (!p) return [];
  return parvaEvents(p).map((e) => {
    const loc = perLocale((l) => localizeEvent(e, l));
    return {
      slug: e.slug,
      date: e.date,
      channel: perLocale((l) => loc[l].channel),
      title: perLocale((l) => loc[l].title),
      dateLabel: perLocale((l) => formatDateFor(e.date, l)),
      path: perLocale((l) => eventPath(loc[l], l)),
    };
  });
}

type DatedRow = TerlaporKronologi & { iso: string };
const isDatedAct = (r: TerlaporKronologi): r is DatedRow => r.jenis === 'Perbuatan' && r.iso !== null;

/** The earliest alleged act (a Perbuatan row, never a Tanggapan) of each full prologue entry: earliest first, the first n. */
export function prologueRecords(entries: SanjayaEntry[], n = 8): PrologueRecord[] {
  const firsts = entries.filter((e) => e.full).flatMap((e) => {
    const acts = e.rows.filter(isDatedAct);
    if (acts.length === 0) return [];
    const first = acts.reduce((a, b) => (b.iso < a.iso ? b : a));
    return [{ iso: first.iso, label: first.tanggal }];
  });
  return firsts.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0)).slice(0, n);
}

export function gameData(p: Perkara): GameData {
  const chapters = buildChapters(PARVAS, p.terlapor);
  return {
    chapters: chapters.map((c) => ({ id: c.id, entries: c.entries.map(entryView) })),
    totals: finaleTotals(p),
    events: chapters.map((_, i) => eventCards(i)),
    prologue: prologueRecords(chapters[0].entries),
  };
}

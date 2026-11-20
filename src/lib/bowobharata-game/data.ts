// The game's data as the island receives it from /pantau-data/bowobharata-game.json: the view types and the URL. It is
// built at build time by data-build.ts, which only src/lib/pantau-props.ts imports, so the island bundles neither the
// builders nor perkara.json. Type-only imports keep it that way.
import type { Locale } from '../../i18n';
import type { TerlaporKronologi } from '../perkara';
import type { ChapterId, Totals } from './record';
import type { ReportData } from './report-types';

/** A dossier row as the screens read it. */
export type RowView = Pick<TerlaporKronologi, 'tanggal' | 'iso' | 'peristiwa'>;
/** A Sanjaya entry. A name-only one (`full` false) keeps its id and name, and the rest is empty. */
export interface EntryView {
  id: string; nama: string; kategori: string; klaster: string | null; dugaan: string; pasal: string[]; laporan: string[];
  rows: RowView[]; full: boolean;
}
export interface ChapterView { id: ChapterId; entries: EntryView[] }
/** One linimasa event of a parva, localised at build time; `slug` is the Indonesian one, `date` its ISO day. */
export interface EventCard {
  slug: string; date: string; channel: Record<Locale, string>; title: Record<Locale, string>; dateLabel: Record<Locale, string>;
  path: Record<Locale, string>;
  /** The event's first paragraph, cut at 280 characters (summaryOf). */
  summary: Record<Locale, string>;
}
/** A prologue date: the ISO value and the dossier's own `tanggal`. It names nobody. */
export interface PrologueRecord { iso: string; label: string }
/** `events[i]` holds chapter i's cards: none for the prologue (0) and the finale (last). */
export interface GameData { chapters: ChapterView[]; totals: Totals; events: EventCard[][]; prologue: PrologueRecord[]; report: ReportData }

export const GAME_DATA_SRC = '/pantau-data/bowobharata-game.json';

const isObject = (v: unknown): v is object => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The payload as GameData when it has the game's shape: chapters, events and prologue are lists, one chapter for each of
 * the island's `count` (the lakon table's chapters and the finale), and totals and report are objects. Anything else (a
 * stale or foreign file, {} or [], null) is null, which the island shows as its data error with a retry.
 */
export function gameDataOf(d: unknown, count: number): GameData | null {
  if (!isObject(d)) return null;
  const g = d as Partial<Record<keyof GameData, unknown>>;
  if (!Array.isArray(g.chapters) || !Array.isArray(g.events) || !Array.isArray(g.prologue)) return null;
  if (g.chapters.length !== count || !isObject(g.totals) || !isObject(g.report)) return null;
  return d as GameData;
}

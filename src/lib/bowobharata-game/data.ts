// The game's data as the island receives it from /pantau-data/bowobharata-game.json: the view types and the URL. It is
// built at build time by data-build.ts, which only src/lib/pantau-props.ts imports, so the island bundles neither the
// builders nor perkara.json. Type-only imports keep it that way.
import type { Locale } from '../../i18n';
import type { TerlaporKronologi } from '../perkara';
import type { ChapterId, Totals } from './record';

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
}
/** A prologue date: the ISO value and the dossier's own `tanggal`. It names nobody. */
export interface PrologueRecord { iso: string; label: string }
/** `events[i]` holds chapter i's cards: none for the prologue (0) and the finale (last). */
export interface GameData { chapters: ChapterView[]; totals: Totals; events: EventCard[][]; prologue: PrologueRecord[] }

export const GAME_DATA_SRC = '/pantau-data/bowobharata-game.json';

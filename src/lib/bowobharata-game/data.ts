// The dossier as the game uses it: Sanjaya's chapters and the finale totals, built from the dossier at build time and
// served as /pantau-data/bowobharata-game.json (src/lib/pantau-props.ts), so the island fetches only this and never
// bundles perkara.json. Category E cases are left out here (buildChapters), not hidden later.
import { PARVAS } from '../bowobharata';
import type { Perkara } from '../perkara';
import { buildChapters, finaleTotals, type Chapter, type SanjayaEntry, type Totals } from './record';

export interface GameData { chapters: Chapter[]; totals: Totals }

export const GAME_DATA_SRC = '/pantau-data/bowobharata-game.json';

/** A name-only entry (a person already reported in an earlier chapter) is shown by name alone, so the rest is dropped. */
const slim = (e: SanjayaEntry): SanjayaEntry => (e.full ? e : { ...e, kategori: '', klaster: null, dugaan: '', pasal: [], laporan: [], rows: [] });

export function gameData(p: Perkara): GameData {
  const chapters = buildChapters(PARVAS, p.terlapor).map((c) => ({ ...c, entries: c.entries.map(slim) }));
  return { chapters, totals: finaleTotals(p) };
}

// The dossier as the game uses it: Sanjaya's chapters and the finale totals. Kept in its own module so the island can load
// it on demand (or the page can pass it in as props) instead of bundling all of perkara.json up front.
import perkaraRaw from '../../data/perkara.json';
import { PARVAS } from '../bowobharata';
import type { Perkara } from '../perkara';
import { buildChapters, finaleTotals, type Chapter, type Totals } from './record';

export interface GameData { chapters: Chapter[]; totals: Totals }

export function gameData(): GameData {
  const p = perkaraRaw as unknown as Perkara;
  return { chapters: buildChapters(PARVAS, p.terlapor), totals: finaleTotals(p) };
}

// The props each /pantau island needs, built once from the published datasets. Used by the page (to server-render the
// islands) and by src/pages/pantau-data/[name].json.ts (to ship the same props as a separate JSON file the island
// fetches when it scrolls into view), so the HTML no longer carries every dataset twice.
import store from '../data/sitemap-watch.json';
import perkaraRaw from '../data/perkara.json';
import fomoRaw from '../data/fomo.json';
import { toRows, type WatchStore } from './sitemap-watch';
import type { Perkara } from './perkara';
import type { Fomo } from './fomo';
import { offsetOf } from './sitemap-insights';
import { computeMatches, buildGraph } from './relasi';
import { localizedEvents, eventPath } from './linimasa-locale';
import type { Locale } from '../i18n';
import { stageItems } from './pantau-3d';
import { WATCH_ORIGIN } from './sitemap-watch';
import { gameData } from './bowobharata-game/data-build';

export const watch = store as WatchStore;
export const perkara = perkaraRaw as unknown as Perkara;
export const fomo = fomoRaw as unknown as Fomo;
export const rows = toRows(watch);
/** Case-file chronology rows about Fomo, for the Fomo section's date-consistency check (FomoDashboard `dossier`). */
export const fomoDossier = perkara.kronologis.filter((r) => /fomo/i.test(r.peristiwa)).map((r) => ({ tanggal: r.tanggal, iso: r.iso, peristiwa: r.peristiwa }));

export const ISLANDS = ['relasi', 'situs-id', 'situs-en', 'perkara', 'fomo', 'stage3d', 'bowobharata-game'] as const;
export type Island = (typeof ISLANDS)[number];

let relasiCache: ReturnType<typeof relasiData> | undefined;
function relasiData() {
  const matches = computeMatches(watch, perkara, fomo);
  const g = buildGraph(watch, perkara, fomo, matches);
  const targetsTotal = Object.keys(watch.urls).filter((p) => /^\/targets\/[^/]+\/$/.test(p)).length;
  return { nodes: g.nodes, edges: g.edges, matches, targetsTotal };
}
export const relasiProps = () => (relasiCache ??= relasiData());

export const situsProps = (locale: Locale) => ({
  rows, snapshots: watch.snapshots,
  events: localizedEvents(locale).map((e) => ({ date: e.date, title: e.title, href: eventPath(e, locale) })),
  offsets: rows.map((r) => offsetOf(watch.urls[r.path].lastmod)),
});

/** Every dated item of the three sources for the fullscreen 3D stage (src/components/PantauFullscreen.tsx). */
export const stageProps = () => ({
  items: stageItems({
    site: rows, fomo: fomo.posts, kronologis: perkara.kronologis, laporan: perkara.laporan,
    terlaporNames: Object.fromEntries(perkara.terlapor.map((t) => [t.id, t.nama])), siteOrigin: WATCH_ORIGIN,
  }),
});

/** Data props (everything except locale and links) of one island. */
export function islandData(name: Island): Record<string, unknown> {
  switch (name) {
    case 'relasi': return relasiProps();
    case 'situs-id': return situsProps('id');
    case 'situs-en': return situsProps('en');
    case 'perkara': return { data: perkara };
    case 'fomo': return { data: fomo, dossier: fomoDossier };
    case 'stage3d': return stageProps();
    case 'bowobharata-game': return { ...gameData(perkara) };
  }
}

/** Where the page's islands fetch their data from. */
export const islandSrc = (name: Island) => `/pantau-data/${name}.json`;

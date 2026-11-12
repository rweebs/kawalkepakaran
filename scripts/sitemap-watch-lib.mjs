// Pure pieces of the rahmatwibowo.net sitemap watch (scripts/snapshot-sitemap.mjs): parse a sitemap and fold one
// snapshot into the stored record. No network or disk here, so tests can drive every case.
import { isSitemapIndex, sitemapEntries } from './indexnow.mjs';

export const WATCH_ORIGIN = 'https://rahmatwibowo.net';
export const WATCH_SITEMAP = `${WATCH_ORIGIN}/sitemap.xml`;

/**
 * Every <url> of a sitemap <urlset> as { path, lastmod, images }, with the origin stripped from the path.
 * Throws on a sitemap index or on a document with no <url> at all, so a broken or changed response is never
 * recorded as "every page was removed".
 */
export function parseSitemap(xml, origin = WATCH_ORIGIN) {
  if (isSitemapIndex(xml)) throw new Error('sitemap index is not supported; point the watch at a <urlset>');
  const entries = sitemapEntries(xml);
  if (entries.length === 0) throw new Error('no <url> entries found');
  const images = new Map();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>([^<]*)<\/loc>/) || [])[1]?.replace(/&amp;/g, '&').trim();
    if (loc !== undefined && !images.has(loc)) images.set(loc, (m[1].match(/<image:image>/g) ?? []).length);
  }
  return entries.map((e) => ({
    path: e.loc.startsWith(origin) ? e.loc.slice(origin.length) || '/' : e.loc,
    lastmod: e.lastmod ?? null,
    images: images.get(e.loc) ?? 0,
  }));
}

/** The first path segment ('evidence' for /evidence/ev-1/), or '' for the home page. */
export const sectionOf = (path) => path.replace(/^\/+/, '').split('/')[0] ?? '';

/**
 * Fold one snapshot into the store. A path keeps the date it was first recorded; lastSeen moves to this snapshot
 * while it is still listed, so a path whose lastSeen is older than the newest snapshot has left the sitemap.
 * A second snapshot on the same day replaces that day's summary instead of adding a point.
 * `provenance` ({ fetchedAt, status, finalUrl, bytes, sha256 } of the raw body) is kept on the snapshot when given.
 */
export function mergeSnapshot(store, entries, date, provenance) {
  const next = {
    source: store?.source ?? WATCH_SITEMAP,
    snapshots: [...(store?.snapshots ?? [])].filter((s) => s.date !== date),
    urls: { ...(store?.urls ?? {}) },
  };
  const sections = {};
  let images = 0;
  for (const e of entries) {
    const prev = next.urls[e.path];
    next.urls[e.path] = {
      firstSeen: prev?.firstSeen && prev.firstSeen < date ? prev.firstSeen : date,
      lastSeen: date,
      lastmod: e.lastmod,
      images: e.images,
    };
    const s = sectionOf(e.path) || '(root)';
    sections[s] = (sections[s] ?? 0) + 1;
    images += e.images;
  }
  next.snapshots.push({
    date, total: entries.length, images, sections: Object.fromEntries(Object.entries(sections).sort()),
    ...(provenance ? { provenance } : {}),
  });
  next.snapshots.sort((a, b) => a.date.localeCompare(b.date));
  next.urls = Object.fromEntries(Object.entries(next.urls).sort(([a], [b]) => a.localeCompare(b)));
  return next;
}

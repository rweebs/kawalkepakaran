// The "latest information" date shown in the footer of every page: the newest <lastmod> in rahmatwibowo.net's public
// sitemap (the most recent change anywhere on that site), and the day /pantau last read that sitemap. Both come from the
// stored sitemap watch (src/data/sitemap-watch.json), never from this site's own content.
import store from '../data/sitemap-watch.json';
import { jakartaDayOf, type WatchStore } from './sitemap-watch';

export interface SitemapLatest {
  /** Newest page change on the watched site, as a Jakarta calendar day (YYYY-MM-DD); null when no URL has a lastmod. */
  lastmod: string | null;
  /** Day of the newest snapshot of the sitemap (YYYY-MM-DD); null when there is none. */
  checked: string | null;
}

export function latestSitemapInfo(s: WatchStore): SitemapLatest {
  let lastmod: string | null = null;
  for (const u of Object.values(s.urls)) {
    const day = jakartaDayOf(u.lastmod);
    if (day && (!lastmod || day > lastmod)) lastmod = day;
  }
  const checked = s.snapshots.reduce<string | null>((acc, x) => (!acc || x.date > acc ? x.date : acc), null);
  return { lastmod, checked };
}

/** Computed once per build; the footer reads it on every page. */
export const SITEMAP_LATEST: SitemapLatest = latestSitemapInfo(store as WatchStore);

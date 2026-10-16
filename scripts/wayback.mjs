// Asks the Internet Archive to snapshot the pages a deploy changed, so there is an independent public record.
//
//   node scripts/wayback.mjs [dist]
//
// Saves / and /en plus the sitemap URLs whose lastmod is recent (same rule as IndexNow, see indexnow.mjs),
// capped at WAYBACK_CAP (default 10). Requests are spaced out politely and a failure never fails the run:
// the archive is a nice-to-have, not part of the deploy.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changedUrls, optionsFromEnv, readSitemap } from './indexnow.mjs';

export const SAVE_ENDPOINT = 'https://web.archive.org/save/';
export const DEFAULT_CAP = 10;
/** Seconds between two save requests; the anonymous Save Page Now API rate-limits aggressively. */
export const PAUSE_SECONDS = 15;

/** / and /en first, then the changed URLs on the site's own origin, without duplicates, at most `cap`. */
export function waybackTargets(site, changed, cap = DEFAULT_CAP) {
  const origin = new URL(site).origin;
  const out = [];
  for (const u of [`${origin}/`, `${origin}/en`, ...changed]) {
    let url;
    try { url = new URL(u); } catch { continue; }
    if (url.origin !== origin) continue;
    const s = url.toString();
    if (!out.includes(s)) out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

export const saveUrl = (url) => `${SAVE_ENDPOINT}${url}`;

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = resolve(process.argv[2] ?? 'dist');
  const site = process.env.SITE_URL || 'https://kawalkepakaran.org';
  const cap = Number.parseInt(process.env.WAYBACK_CAP ?? '', 10) || DEFAULT_CAP;
  let changed = [];
  try { changed = changedUrls(readSitemap(dist).entries, optionsFromEnv(process.env)); } catch (e) { console.log(`wayback: ${e.message}; saving / and /en only`); }
  const targets = waybackTargets(site, changed, cap);
  for (const [i, url] of targets.entries()) {
    if (i > 0) await sleep(PAUSE_SECONDS);
    try {
      const res = await fetch(saveUrl(url), { redirect: 'manual', signal: AbortSignal.timeout(90_000), headers: { 'User-Agent': 'kawalkepakaran.org CI (Wayback snapshot)' } });
      console.log(`wayback: ${res.status} ${url}`);
    } catch (e) {
      console.log(`::warning::wayback: ${url} not saved (${e.message})`);
    }
  }
  process.exit(0);
}

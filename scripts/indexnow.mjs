// Tells IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver...) which URLs a deploy changed.
//
//   node scripts/indexnow.mjs write-key [dist]   writes dist/<key>.txt so the key is served at /<key>.txt
//   node scripts/indexnow.mjs submit [dist]      POSTs the changed sitemap URLs to api.indexnow.org (run after deploy)
//   node scripts/indexnow.mjs changed [dist]     prints the changed sitemap URLs, one per line (needs no key)
//
// The site is deployed two ways (see .github/workflows/ci.yml), so `npm run build` writes the key file itself:
// Cloudflare's Git integration builds from the repo and sees INDEXNOW_KEY only if the owner also sets it in the
// Cloudflare build environment. `submit` first checks that https://<site>/<key>.txt is live and returns the key;
// if it is not, it prints a warning and exits 0 rather than pinging with a key the engines cannot verify.
//
// "Changed" means a sitemap <lastmod> within the last INDEXNOW_DAYS days (default 2). INDEXNOW_ALL=true submits
// every URL (the CI workflow sets it for a manual run with the `all` input).
//
// The key comes from the INDEXNOW_KEY environment variable. Without it the script prints a note and exits 0,
// so forks and local builds never fail on it.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteRoot } from './site-root.mjs';

export const ENDPOINT = 'https://api.indexnow.org/indexnow';
/** IndexNow accepts at most 10,000 URLs per request. */
export const BATCH = 10000;
/** A URL counts as changed when its lastmod is no older than this many days. */
export const CHANGED_DAYS = 2;

/** IndexNow keys are 8 to 128 characters of a-z, A-Z, 0-9 and dashes. */
export const isValidKey = (key) => typeof key === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(key);

const unescapeXml = (s) => s.replace(/&amp;/g, '&').trim();

/** True for a <sitemapindex> document (a sitemap of sitemaps). */
export const isSitemapIndex = (xml) => /<sitemapindex[\s>]/.test(xml);

/** The <loc> of every child sitemap in a <sitemapindex>. */
export function childSitemaps(xml) {
  return [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)]
    .map((m) => (m[1].match(/<loc>([^<]*)<\/loc>/) || [])[1])
    .filter((loc) => loc !== undefined)
    .map(unescapeXml);
}

/** { loc, lastmod } for every <url> of a <urlset>, in order, without duplicate locs. lastmod is undefined when absent. */
export function sitemapEntries(xml) {
  const seen = new Set();
  const out = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>([^<]*)<\/loc>/) || [])[1];
    if (loc === undefined) continue;
    const url = unescapeXml(loc);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ loc: url, lastmod: (m[1].match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1]?.trim() });
  }
  return out;
}

/** The <loc> URLs of a sitemap, unescaped, in order, without duplicates. */
export const sitemapUrls = (xml) => sitemapEntries(xml).map((e) => e.loc);

/**
 * Reads /sitemap.xml from a built site. When it is a <sitemapindex>, the child sitemaps are read from the same
 * dist by their path, so this works whether the site ships one <urlset> or an index with child files.
 * Returns { entries, files }; throws with a readable message when a file is missing.
 */
export function readSitemap(distDir) {
  const dist = siteRoot(distDir);
  const top = join(dist, 'sitemap.xml');
  if (!existsSync(top)) throw new Error(`${top} is missing; run the build first`);
  const xml = readFileSync(top, 'utf8');
  if (!isSitemapIndex(xml)) return { entries: sitemapEntries(xml), files: [top] };
  const entries = [];
  const files = [top];
  const seen = new Set();
  for (const loc of childSitemaps(xml)) {
    const file = join(dist, decodeURIComponent(new URL(loc).pathname));
    if (!existsSync(file)) throw new Error(`${top} lists ${loc} but ${file} is missing`);
    files.push(file);
    for (const e of sitemapEntries(readFileSync(file, 'utf8'))) {
      if (!seen.has(e.loc)) { seen.add(e.loc); entries.push(e); }
    }
  }
  return { entries, files };
}

/** Midnight UTC of the calendar day a time falls on. */
const utcDay = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

/**
 * The URLs worth announcing: every entry when `all`, otherwise those whose lastmod (YYYY-MM-DD or a full
 * W3C datetime) falls on one of the last `days` calendar days before `now`, or later. Entries without a
 * readable lastmod are left out.
 */
export function changedUrls(entries, { now = new Date(), days = CHANGED_DAYS, all = false } = {}) {
  if (all) return entries.map((e) => e.loc);
  const cutoff = utcDay(now.getTime()) - days * 86_400_000;
  return entries.filter((e) => {
    const t = e.lastmod ? Date.parse(e.lastmod) : NaN;
    return !Number.isNaN(t) && utcDay(t) >= cutoff;
  }).map((e) => e.loc);
}

/** One request body per batch; only URLs on the site's own host are submitted. */
export function payloads(urls, key, site) {
  const { host, origin } = new URL(site);
  const own = urls.filter((u) => { try { return new URL(u).host === host; } catch { return false; } });
  const out = [];
  for (let i = 0; i < own.length; i += BATCH) {
    out.push({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: own.slice(i, i + BATCH) });
  }
  return out;
}

export function writeKeyFile(dist, key) {
  const file = join(siteRoot(dist), `${key}.txt`);
  writeFileSync(file, key);
  return file;
}

/** True when the live site serves /<key>.txt with exactly the key (the engines verify ownership this way). */
export async function keyIsLive(key, site, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${new URL(site).origin}/${key}.txt`, { redirect: 'follow' });
    return res.status === 200 && (await res.text()).trim() === key;
  } catch {
    return false;
  }
}

/** Options from the environment: INDEXNOW_ALL=true submits everything, INDEXNOW_DAYS changes the window. */
export function optionsFromEnv(env) {
  const days = Number.parseInt(env.INDEXNOW_DAYS ?? '', 10);
  return { all: env.INDEXNOW_ALL === 'true', days: Number.isFinite(days) && days >= 0 ? days : CHANGED_DAYS };
}

async function submit(dist, key, site, opts) {
  let entries;
  try { ({ entries } = readSitemap(dist)); } catch (e) { console.error(`indexnow: ${e.message}`); return 1; }
  const bodies = payloads(changedUrls(entries, opts), key, site);
  if (!bodies.length) { console.log(`indexnow: no URLs changed in the last ${opts.days} days; nothing to submit`); return 0; }
  if (!(await keyIsLive(key, site))) {
    console.log(`::warning::indexnow: ${new URL(site).origin}/${key}.txt does not serve the key; skipping. `
      + 'When Cloudflare builds the site, INDEXNOW_KEY must also be set in the Cloudflare build environment.');
    return 0;
  }
  for (const body of bodies) {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
    // 200 OK and 202 Accepted both mean the URLs were received; anything else is reported but does not undo the deploy.
    if (res.status !== 200 && res.status !== 202) {
      console.error(`indexnow: ${res.status} ${res.statusText} for ${body.urlList.length} URLs`);
      return 1;
    }
    console.log(`indexnow: submitted ${body.urlList.length} URLs (${res.status})`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode = 'submit', distArg = 'dist'] = process.argv.slice(2);
  const site = process.env.SITE_URL || 'https://kawalkepakaran.org';
  const dist = resolve(distArg);
  const opts = optionsFromEnv(process.env);
  if (mode === 'changed') {
    try {
      for (const u of changedUrls(readSitemap(dist).entries, opts)) console.log(u);
    } catch (e) { console.error(`indexnow: ${e.message}`); process.exit(1); }
    process.exit(0);
  }
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log('indexnow: INDEXNOW_KEY is not set; skipping');
    process.exit(0);
  }
  if (!isValidKey(key)) {
    console.error('indexnow: INDEXNOW_KEY must be 8-128 characters of letters, digits and dashes');
    process.exit(1);
  }
  if (mode === 'write-key') {
    console.log(`indexnow: wrote ${writeKeyFile(dist, key)}`);
  } else if (mode === 'submit') {
    process.exit(await submit(dist, key, site, opts));
  } else {
    console.error(`indexnow: unknown mode "${mode}" (use write-key, submit or changed)`);
    process.exit(1);
  }
}

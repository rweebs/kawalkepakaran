// Tells IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver...) which URLs the deploy published.
//
//   node scripts/indexnow.mjs write-key [dist]   writes dist/<key>.txt so the key is served at /<key>.txt (run before deploy)
//   node scripts/indexnow.mjs submit [dist]      POSTs every sitemap URL to api.indexnow.org (run after deploy)
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

/** IndexNow keys are 8 to 128 characters of a-z, A-Z, 0-9 and dashes. */
export const isValidKey = (key) => typeof key === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(key);

/** The <loc> URLs of a sitemap, unescaped, in order, without duplicates. */
export function sitemapUrls(xml) {
  const urls = [...xml.matchAll(/<url>[\s\S]*?<loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&').trim());
  return [...new Set(urls)];
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

async function submit(dist, key, site) {
  const file = join(siteRoot(dist), 'sitemap.xml');
  if (!existsSync(file)) { console.error(`indexnow: ${file} is missing; run the build first`); return 1; }
  const bodies = payloads(sitemapUrls(readFileSync(file, 'utf8')), key, site);
  if (!bodies.length) { console.log('indexnow: no URLs to submit'); return 0; }
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
  const key = process.env.INDEXNOW_KEY?.trim();
  const site = process.env.SITE_URL || 'https://kawalkepakaran.org';
  const dist = resolve(distArg);
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
    process.exit(await submit(dist, key, site));
  } else {
    console.error(`indexnow: unknown mode "${mode}" (use write-key or submit)`);
    process.exit(1);
  }
}

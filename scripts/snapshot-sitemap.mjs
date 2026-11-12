// Records today's rahmatwibowo.net sitemap into src/data/sitemap-watch.json for the /pantau dashboard.
// Runs before every build. A failed fetch never fails the build: the page keeps the last committed record.
// History only grows when the updated JSON is committed (`npm run snapshot` locally, then commit).
//
// Each snapshot keeps its provenance (fetch time, HTTP status, final URL, size and SHA-256 of the raw body) and the raw
// XML itself, gzipped, under source/sitemap-watch/<day>.xml.gz, so anyone can re-hash it and check the record.
// With WAYBACK=1 (never during a normal build) it also asks the Internet Archive to save the sitemap and the URLs that
// this snapshot lists for the first time, as an independent third-party copy.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WATCH_ORIGIN, WATCH_SITEMAP, parseSitemap, mergeSnapshot } from './sitemap-watch-lib.mjs';
import { saveUrl, PAUSE_SECONDS } from './wayback.mjs';

export const STORE = 'src/data/sitemap-watch.json';
export const ARCHIVE_DIR = 'source/sitemap-watch';
export const MAX_BYTES = 25 * 1024 * 1024;
export const WAYBACK_CAP = 20;
// A plain desktop-browser user agent: the watch should see what any visitor sees, not a page served to a known fetcher.
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const WATCH_HOST = new URL(WATCH_ORIGIN).host;

/** Today's date in Jakarta (UTC+7), the time zone the project reports in. */
export const jakartaDay = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** The response body as a Buffer, aborting once it passes `max` bytes (declared or actual). */
export async function readCapped(res, max = MAX_BYTES) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) throw new Error(`sitemap is ${declared} bytes, over the ${max}-byte cap`);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error(`sitemap passed the ${max}-byte cap`);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/** Fetch the sitemap: refuse a redirect off the watched host and an oversized body; return the raw body and its provenance. */
export async function fetchSitemap({ fetchImpl = fetch, now = new Date(), max = MAX_BYTES } = {}) {
  const res = await fetchImpl(WATCH_SITEMAP, { redirect: 'follow', signal: AbortSignal.timeout(30_000), headers: { 'user-agent': USER_AGENT, accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' } });
  const finalUrl = res.url || WATCH_SITEMAP;
  const host = new URL(finalUrl).host;
  if (host !== WATCH_HOST) throw new Error(`redirected off ${WATCH_HOST} to ${host}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await readCapped(res, max);
  return {
    body,
    provenance: { fetchedAt: now.toISOString(), status: res.status, finalUrl, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') },
  };
}

export async function snapshot({ store = STORE, archiveDir = ARCHIVE_DIR, fetchImpl = fetch, now = new Date() } = {}) {
  const prev = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : null;
  const { body, provenance } = await fetchSitemap({ fetchImpl, now });
  const entries = parseSitemap(body.toString('utf8'));
  const date = jakartaDay(now);
  mkdirSync(archiveDir, { recursive: true });
  // mtime 0 in the gzip header (Node's default), so the same body always gives the same file.
  writeFileSync(join(archiveDir, `${date}.xml.gz`), gzipSync(body, { level: 9 }));
  const next = mergeSnapshot(prev, entries, date, provenance);
  writeFileSync(store, `${JSON.stringify(next)}\n`);
  return { snapshot: next.snapshots.at(-1), store: next };
}

/** The sitemap plus URLs first listed at this snapshot, at most `cap`. The first snapshot is a baseline: only the sitemap. */
export function waybackTargets(store, date, cap = WAYBACK_CAP) {
  const out = [WATCH_SITEMAP];
  if ((store.snapshots ?? []).length < 2) return out;
  for (const [path, u] of Object.entries(store.urls)) {
    if (out.length >= cap) break;
    if (u.firstSeen === date) out.push(`${WATCH_ORIGIN}${path}`);
  }
  return out;
}

/** Ask Save Page Now for each URL, pausing between requests. Never throws; returns one result per URL. */
export async function submitWayback(urls, { fetchImpl = fetch, pause = PAUSE_SECONDS, sleep = (s) => new Promise((r) => setTimeout(r, s * 1000)) } = {}) {
  const results = [];
  for (const [i, url] of urls.entries()) {
    if (i > 0) await sleep(pause);
    try {
      const res = await fetchImpl(saveUrl(url), { redirect: 'manual', signal: AbortSignal.timeout(90_000), headers: { 'user-agent': USER_AGENT } });
      results.push({ url, status: res.status });
    } catch (e) {
      results.push({ url, error: String(e?.message ?? e) });
    }
  }
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const { snapshot: s, store } = await snapshot();
    console.log(`sitemap-watch: ${s.total} URLs recorded for ${s.date} (sha256 ${s.provenance.sha256.slice(0, 12)}, ${s.provenance.bytes} bytes)`);
    if (process.env.WAYBACK === '1') {
      const results = await submitWayback(waybackTargets(store, s.date));
      s.provenance.wayback = results;
      writeFileSync(STORE, `${JSON.stringify(store)}\n`);
      for (const r of results) console.log(`sitemap-watch wayback: ${r.status ?? r.error} ${r.url}`);
    }
  } catch (e) {
    console.warn(`sitemap-watch: snapshot skipped (${e.message}); keeping ${STORE} as committed`);
  }
}

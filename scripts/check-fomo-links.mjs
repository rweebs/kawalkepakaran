// Records whether each Fomo thread linked from /pantau still resolves, into src/data/fomo-link-status.json.
// Run by hand (it makes one request per thread, paced); the build never runs it. A login page or 401/403 counts as
// "login" (the thread may exist behind the wall), 404/410 as "gone", other failures as "error". Nothing is guessed.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OUT = 'src/data/fomo-link-status.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function classify(code, finalUrl = '') {
  if (code === 404 || code === 410) return 'gone';
  if (code === 401 || code === 403 || /\/(login|masuk|signin)/i.test(finalUrl)) return 'login';
  if (code >= 200 && code < 400) return 'live';
  return 'error';
}

export async function checkLinks(urls, { fetchImpl = fetch, now = () => new Date(), pauseMs = 1500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const out = [];
  for (const [i, url] of urls.entries()) {
    if (i) await sleep(pauseMs);
    try {
      const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': UA } });
      out.push({ url, status: classify(res.status, res.url), code: res.status, checkedAt: now().toISOString() });
    } catch {
      out.push({ url, status: 'error', code: null, checkedAt: now().toISOString() });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fomo = JSON.parse(readFileSync('src/data/fomo.json', 'utf8'));
  const urls = [...new Set(fomo.threads.map((t) => t.url).filter(Boolean))];
  const result = await checkLinks(urls);
  writeFileSync(OUT, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`check-fomo-links: ${result.length} threads checked -> ${OUT}`);
}

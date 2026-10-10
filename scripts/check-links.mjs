import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteRoot } from './site-root.mjs';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Every distinct external http(s) link in the built pages, with the pages that use it. */
export function externalLinks(distDir) {
  const links = new Map();
  for (const file of htmlFiles(siteRoot(distDir))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<a\s[^>]*href="(https?:\/\/[^"#]+)/g)) {
      const url = m[1].replace(/&amp;/g, '&');
      if (!links.has(url)) links.set(url, []);
      links.get(url).push(file);
    }
  }
  return links;
}

async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'KawalKepakaran-linkcheck/1.0' } });
      if (res.status < 400 || res.status === 401 || res.status === 403 || res.status === 429 || res.status === 999) return { ok: true, status: res.status };
      if (method === 'GET') return { ok: false, status: res.status };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: String(e.cause?.code ?? e.name) };
    }
  }
  return { ok: false, status: 'unknown' };
}

export async function checkLinks(distDir, concurrency = 8) {
  const links = [...externalLinks(distDir).keys()];
  const broken = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < links.length) {
      const url = links[next++];
      const r = await probe(url);
      if (!r.ok) broken.push({ url, status: r.status });
    }
  }));
  return { checked: links.length, broken };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { checked, broken } = await checkLinks(resolve(process.argv[2] ?? 'dist'));
  console.log(`checked ${checked} external links, ${broken.length} broken`);
  for (const b of broken) console.log(`  ${b.status} ${b.url}`);
  process.exit(broken.length ? 1 : 0);
}

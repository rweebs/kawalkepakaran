import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteRoot } from './site-root.mjs';

// Every JSON-LD block in the built site must parse, every publisher must be the one Kawal Kepakaran Organization, and
// every image it names on this site must exist (prune-images removes files no page references).
const DEFAULT_SITE = 'https://kawalkepakaran.org';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Every value stored under `key` anywhere in a JSON tree. */
function under(node, key, out = []) {
  if (Array.isArray(node)) node.forEach((n) => under(n, key, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(...(Array.isArray(v) ? v : [v]));
      under(v, key, out);
    }
  }
  return out;
}

export function findJsonLdProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const orgId = `${origin}/#organization`;
  const problems = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let ld;
      try { ld = JSON.parse(m[1]); } catch { problems.push(`${file}: invalid JSON-LD`); continue; }
      for (const p of under(ld, 'publisher')) {
        const id = p && typeof p === 'object' ? p['@id'] : undefined;
        if (id !== orgId) problems.push(`${file}: publisher @id ${id ?? '(missing)'} is not ${orgId}`);
      }
      for (const key of ['contentUrl', 'thumbnailUrl']) {
        for (const u of under(ld, key)) {
          let url;
          try { url = new URL(u); } catch { problems.push(`${file}: ${key} is not an absolute URL ${u}`); continue; }
          if (url.origin === origin && !existsSync(join(dist, decodeURIComponent(url.pathname)))) problems.push(`${file}: ${key} not found ${url.pathname}`);
        }
      }
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  const problems = findJsonLdProblems(process.argv[2] ?? 'dist');
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`check-jsonld: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('check-jsonld: ok');
}

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteRoot } from './site-root.mjs';

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

function pageUrl(dist, file) {
  const rel = relative(dist, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
}

function pathExists(dist, pathname) {
  const clean = decodeURIComponent(pathname);
  if (clean === '/' || clean === '') return existsSync(join(dist, 'index.html'));
  const base = join(dist, clean);
  if (existsSync(base) && statSync(base).isFile()) return true;
  return existsSync(join(base, 'index.html')) || existsSync(`${base}.html`);
}

export function findProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const files = htmlFiles(dist);
  if (files.length === 0) return [`${dist}: no HTML pages found`];
  const origin = new URL(site).origin;
  const problems = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const base = new URL(pageUrl(dist, file), origin);
    if (!html.includes('data-disclaimer')) problems.push(`${file}: missing disclaimer banner`);
    const lang = /^\/en(\/|$)/.test(base.pathname) ? 'en' : 'id';
    if (!new RegExp(`<html[^>]*\\slang="${lang}"`).test(html)) problems.push(`${file}: html lang is not "${lang}"`);
    if (!/<a class="skip-link" href="#main"/.test(html) || !/<main id="main"/.test(html)) problems.push(`${file}: missing skip link or main#main`);
    for (const m of html.matchAll(/<img(?=\s)[^>]*\ssrc="\/(?:img|thumb)\/[^"]+"[^>]*>/g)) {
      if (!/\swidth=/.test(m[0]) || !/\sheight=/.test(m[0])) problems.push(`${file}: image without width/height ${m[0].slice(0, 80)}`);
    }
    const noindex = /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html);
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '';
    if (title.length < 10 || title.length > 65) problems.push(`${file}: title length ${title.length} (want 10-65)`);
    if (!noindex) {
      const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? '';
      if (desc.length < 70 || desc.length > 170) problems.push(`${file}: meta description length ${desc.length} (want 70-170)`);
      const h1s = (html.match(/<h1[\s>]/g) || []).length;
      if (h1s !== 1) problems.push(`${file}: expected exactly one h1, found ${h1s}`);
      const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
      if (canon !== base.toString()) problems.push(`${file}: canonical ${canon ?? '(missing)'} does not match ${base.toString()}`);
    }
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch { problems.push(`${file}: invalid JSON-LD`); }
    }
    const og = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/);
    if (!og) problems.push(`${file}: missing og:image`);
    else {
      let ogUrl;
      try { ogUrl = new URL(og[1], base); } catch { ogUrl = null; }
      if (!ogUrl || (ogUrl.origin === origin && !pathExists(dist, ogUrl.pathname))) problems.push(`${file}: og:image file not found ${og[1]}`);
    }
    if (/<details[^>]*class="nav__menu"/.test(html) && !/<details[^>]*class="nav__menu"[^>]*\sopen/.test(html)) {
      problems.push(`${file}: nav menu is not open by default (breaks without JavaScript)`);
    }
    for (const m of html.matchAll(/(?:src|href)=(?:"([^"]*)"|'([^']*)')/g)) {
      const raw = (m[1] ?? m[2] ?? '').trim();
      if (raw === '' || raw.startsWith('#') || /^(mailto:|tel:|data:|javascript:)/i.test(raw)) continue;
      let url;
      try { url = new URL(raw, base); } catch { continue; }
      if (url.origin !== origin) continue;
      if (!pathExists(dist, url.pathname)) problems.push(`${file}: unresolved reference ${raw}`);
    }
  }
  return problems;
}

function pageFileFor(dist, pathname) {
  const clean = decodeURIComponent(pathname);
  if (clean === '/' || clean === '') return join(dist, 'index.html');
  for (const f of [`${join(dist, clean)}.html`, join(dist, clean, 'index.html')]) if (existsSync(f)) return f;
  return null;
}

/** hreflang pairs must point at each other, and at pages that exist. */
export function findHreflangProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const problems = [];
  const alts = new Map();
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    if (/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html)) continue;
    const here = new URL(pageUrl(dist, file), origin).toString();
    const map = {};
    for (const m of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) map[m[1]] = m[2];
    if (Object.keys(map).length) alts.set(here, { file, map });
  }
  for (const [here, { file, map }] of alts) {
    if (map.id !== here && map.en !== here) problems.push(`${file}: hreflang does not list the page itself`);
    for (const l of ['id', 'en']) {
      const target = map[l];
      if (!target || target === here) continue;
      const back = alts.get(target);
      if (!back) problems.push(`${file}: hreflang ${l} ${target} is missing or noindex`);
      else if (back.map.id !== here && back.map.en !== here) problems.push(`${file}: ${target} does not link back`);
    }
  }
  return problems;
}

export const OG_MAX_BYTES = 300_000;
/** Every og:image a page names must exist in dist and stay under 300 KB (WhatsApp drops larger previews). */
export function findOgImageProblems(distDir, site = DEFAULT_SITE, maxBytes = OG_MAX_BYTES) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const problems = [];
  const sizes = new Map();
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    const base = new URL(pageUrl(dist, file), origin);
    for (const m of html.matchAll(/<meta(?=\s)[^>]*property="og:image"[^>]*>/g)) {
      const content = (m[0].match(/\scontent="([^"]*)"/) || [])[1];
      if (!content) { problems.push(`${file}: og:image without content`); continue; }
      let url;
      try { url = new URL(content.replace(/&amp;/g, '&'), base); } catch { problems.push(`${file}: og:image is not a URL ${content}`); continue; }
      if (url.origin !== origin) continue;
      const path = join(dist, decodeURIComponent(url.pathname));
      if (!sizes.has(path)) sizes.set(path, existsSync(path) && statSync(path).isFile() ? statSync(path).size : -1);
      const size = sizes.get(path);
      if (size < 0) problems.push(`${file}: og:image missing ${url.pathname}`);
      else if (size > maxBytes) problems.push(`${file}: og:image ${url.pathname} is ${size} bytes (max ${maxBytes})`);
    }
  }
  return problems;
}

const BUNDLE_BUDGET = { 'three.module': 700_000, default: 260_000 };
/** No script chunk may grow past its budget (bytes, uncompressed). */
export function findBundleProblems(distDir) {
  const dir = join(siteRoot(distDir), '_astro');
  if (!existsSync(dir)) return [];
  const problems = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const size = statSync(join(dir, name)).size;
    const key = Object.keys(BUNDLE_BUDGET).find((k) => k !== 'default' && name.startsWith(k));
    const limit = BUNDLE_BUDGET[key ?? 'default'];
    if (size > limit) problems.push(`${name}: ${size} bytes exceeds the ${limit} budget`);
  }
  return problems;
}

const NOINDEX = /<meta[^>]*name="robots"[^>]*content="[^"]*noindex/;
/** True when the page tells search engines not to index it. */
export const isNoindex = (html) => NOINDEX.test(html);
/** The not-found pages are noindex and never belong in the sitemap. */
const isNotFoundPath = (pathname) => /^\/(?:en\/)?404$/.test(pathname);
/** The URL a page is served at on the live site: no trailing slash (except the root) and no .html. */
const selfUrl = (dist, file, origin) => {
  const p = pageUrl(dist, file);
  return new URL(p.length > 1 ? p.replace(/\/$/, '') : p, origin).toString();
};

/**
 * Reads /sitemap.xml and, when it is a <sitemapindex>, every child sitemap it lists (from dist, by path).
 * Returns { docs: [{ file, xml }], problems }; docs holds only <urlset> documents.
 */
export function readSitemapDocs(dist, origin) {
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return { docs: [], problems: [`${dist}: sitemap.xml is missing`] };
  const xml = readFileSync(file, 'utf8');
  if (/<urlset[\s>]/.test(xml)) return { docs: [{ file, xml }], problems: [] };
  if (!/<sitemapindex[\s>]/.test(xml)) return { docs: [], problems: [`${file}: neither a <urlset> nor a <sitemapindex>`] };
  const docs = [];
  const problems = [];
  const children = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].map((m) => ((m[1].match(/<loc>([^<]*)<\/loc>/) || [])[1] ?? '').replace(/&amp;/g, '&').trim());
  if (!children.length) problems.push(`${file}: sitemap index lists no sitemaps`);
  for (const loc of children) {
    let url;
    try { url = new URL(loc); } catch { problems.push(`${file}: invalid child sitemap loc "${loc}"`); continue; }
    if (url.origin !== origin) { problems.push(`${file}: child sitemap on another origin ${loc}`); continue; }
    const child = join(dist, decodeURIComponent(url.pathname));
    if (!existsSync(child) || !statSync(child).isFile()) { problems.push(`${file}: child sitemap missing ${url.pathname}`); continue; }
    const childXml = readFileSync(child, 'utf8');
    if (!/<urlset[\s>]/.test(childXml)) { problems.push(`${child}: child sitemap is not a <urlset>`); continue; }
    docs.push({ file: child, xml: childXml });
  }
  return { docs, problems };
}

/**
 * The sitemap (a single <urlset>, or a <sitemapindex> and its children) lists exactly the indexable pages:
 * every URL resolves to a page that is not noindex, and every indexable page except the 404s is listed.
 */
export function findSitemapProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const { docs, problems } = readSitemapDocs(dist, origin);
  if (!docs.length) return problems.length ? problems : [`${dist}: sitemap lists no URLs`];
  const listed = new Set();
  const blocks = docs.flatMap(({ file, xml }) => [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ file, b: m[1] })));
  for (const { file, xml } of docs) {
    if ((xml.match(/<url>/g) || []).length > 50000) problems.push(`${file}: more than 50,000 URLs`);
  }
  for (const { file, b } of blocks) {
    const loc = ((b.match(/<loc>([^<]*)<\/loc>/) || [])[1] ?? '').replace(/&amp;/g, '&').trim();
    const lastmod = (b.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    let url;
    try { url = new URL(loc); } catch { problems.push(`${file}: invalid loc "${loc}"`); continue; }
    if (listed.has(url.toString())) problems.push(`${file}: duplicate URL ${url}`);
    listed.add(url.toString());
    if (lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) problems.push(`${file}: malformed lastmod "${lastmod}" for ${loc}`);
    if (url.origin !== origin) { problems.push(`${file}: URL on another origin ${loc}`); continue; }
    const page = pageFileFor(dist, url.pathname);
    if (!page) { problems.push(`${file}: no page for ${url.pathname}`); continue; }
    if (isNoindex(readFileSync(page, 'utf8'))) problems.push(`${file}: noindex page listed ${url.pathname}`);
  }
  for (const { file, b } of blocks) {
    for (const m of b.matchAll(/<xhtml:link[^>]*href="([^"]+)"/g)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (!listed.has(href)) problems.push(`${file}: hreflang target not in sitemap ${href}`);
    }
  }
  const where = docs.length === 1 ? docs[0].file : join(dist, 'sitemap.xml');
  for (const page of htmlFiles(dist)) {
    if (isNoindex(readFileSync(page, 'utf8'))) continue;
    const expected = selfUrl(dist, page, origin);
    const { pathname } = new URL(expected);
    if (isNotFoundPath(pathname)) continue;
    if (!listed.has(expected)) problems.push(`${where}: indexable page not in sitemap ${pathname}`);
  }
  return problems;
}

/**
 * Every indexable page names itself as canonical, on the production origin, in the form the live site
 * serves without a redirect: no trailing slash (except the root), no .html, no query or fragment.
 */
export function findCanonicalProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const problems = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    if (isNoindex(html)) continue;
    const tags = [...html.matchAll(/<link(?=\s)[^>]*\srel="canonical"[^>]*>/g)];
    if (tags.length !== 1) { problems.push(`${file}: expected one canonical link, found ${tags.length}`); continue; }
    const href = (tags[0][0].match(/\shref="([^"]*)"/) || [])[1];
    if (!href) { problems.push(`${file}: canonical without href`); continue; }
    if (!href.startsWith(`${origin}/`)) { problems.push(`${file}: canonical ${href} is not on ${origin}`); continue; }
    const url = new URL(href);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) problems.push(`${file}: canonical ${href} has a trailing slash`);
    if (url.pathname.endsWith('.html')) problems.push(`${file}: canonical ${href} ends in .html`);
    if (url.search || url.hash) problems.push(`${file}: canonical ${href} has a query or fragment`);
    const self = selfUrl(dist, file, origin);
    if (url.toString() !== self) problems.push(`${file}: canonical ${href} is not the page itself (${self})`);
  }
  return problems;
}

/**
 * Internal links must use the redirect-free form: Cloudflare answers /path/ and /path.html with a 307 to /path,
 * which costs a round trip and dilutes the signal search engines see. "/" itself is fine.
 */
export function findInternalLinkProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const problems = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    const base = new URL(pageUrl(dist, file), origin);
    for (const m of html.matchAll(/<a(?=\s)[^>]*?\shref=(?:"([^"]*)"|'([^']*)')/g)) {
      const raw = (m[1] ?? m[2] ?? '').trim();
      if (raw === '' || raw.startsWith('#') || (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw))) continue;
      let url;
      try { url = new URL(raw.replace(/&amp;/g, '&'), base); } catch { continue; }
      if (url.origin !== origin) continue;
      if (url.pathname.length > 1 && url.pathname.endsWith('/')) problems.push(`${file}: link ${raw} ends in "/" (served as a 307)`);
      else if (url.pathname.endsWith('.html')) problems.push(`${file}: link ${raw} ends in ".html" (served as a 307)`);
    }
  }
  return problems;
}

/** Content collections whose generated entries get their own pages, with the routes they are served at. */
export const GENERATED_ROUTES = { pakar: ['/pakar', '/en/experts'], klaim: ['/klaim', '/en/claims'] };
/** Archive routes: everything at or under these paths must be noindex. */
export const ARCHIVE_PREFIXES = ['/arsip', '/en/archive', '/pakar/arsip', '/klaim/arsip', '/en/experts/archive', '/en/claims/archive'];

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** Ids of the entries generated from the archive ("source": "arsip"), as src/content.config.ts derives them. */
export function generatedEntries(contentDir) {
  const out = [];
  for (const [collection, routes] of Object.entries(GENERATED_ROUTES)) {
    const base = join(contentDir, collection);
    for (const file of jsonFiles(base)) {
      let data;
      try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
      if (data?.source !== 'arsip') continue;
      const id = relative(base, file).split(sep).join('/').replace(/^generated\//, '').replace(/\.json$/, '');
      out.push({ collection, id, file, draft: data.draft === true, paths: routes.map((r) => `${r}/${id}`) });
    }
  }
  return out;
}

/**
 * LEGAL GUARD. Pages built from entries generated out of the author's archive, and the archive itself, name
 * people in disputes without a curated review; they must never be indexable. A page that loses its noindex
 * (or a generated entry whose page disappears, so the guard can no longer see it) fails the build.
 */
export function findLegalGuardProblems(distDir, contentDir = 'src/content', site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const problems = [];
  for (const entry of generatedEntries(contentDir)) {
    for (const path of entry.paths) {
      const page = pageFileFor(dist, path);
      if (!page) {
        if (!entry.draft) problems.push(`LEGAL GUARD: ${path} (generated from ${entry.file}) has no page, so its noindex cannot be checked`);
        continue;
      }
      if (!isNoindex(readFileSync(page, 'utf8'))) problems.push(`LEGAL GUARD: ${path} is generated from the archive (${entry.file}) but is indexable; it must be noindex`);
    }
  }
  for (const file of htmlFiles(dist)) {
    const { pathname } = new URL(selfUrl(dist, file, origin));
    if (!ARCHIVE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) continue;
    if (!isNoindex(readFileSync(file, 'utf8'))) problems.push(`LEGAL GUARD: archive page ${pathname} is indexable; it must be noindex`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = resolve(process.argv[2] ?? 'dist');
  const problems = [
    ...findLegalGuardProblems(dist),
    ...findProblems(dist), ...findSitemapProblems(dist), ...findHreflangProblems(dist), ...findBundleProblems(dist), ...findOgImageProblems(dist),
    ...findCanonicalProblems(dist), ...findInternalLinkProblems(dist),
  ];
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`dist OK (${htmlFiles(dist).length} pages)`);
}

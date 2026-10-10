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

export function findSitemapProblems(distDir, site = DEFAULT_SITE) {
  const dist = siteRoot(distDir);
  const origin = new URL(site).origin;
  const file = join(dist, 'sitemap.xml');
  if (!existsSync(file)) return [`${dist}: sitemap.xml is missing`];
  const xml = readFileSync(file, 'utf8');
  if (!/<urlset[\s>]/.test(xml)) return [`${file}: not a <urlset> sitemap`];
  const problems = [];
  const listed = new Set();
  const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  if (blocks.length > 50000) problems.push(`${file}: more than 50,000 URLs`);
  for (const b of blocks) {
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
    if (/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(readFileSync(page, 'utf8'))) {
      problems.push(`${file}: noindex page listed ${url.pathname}`);
    }
  }
  for (const page of htmlFiles(dist)) {
    const html = readFileSync(page, 'utf8');
    if (/<meta[^>]*name="robots"[^>]*content="[^"]*noindex/.test(html)) continue;
    const expected = new URL(pageUrl(dist, page), origin).toString();
    if (!listed.has(expected)) problems.push(`${file}: indexable page not in sitemap ${new URL(expected).pathname}`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = resolve(process.argv[2] ?? 'dist');
  const problems = [...findProblems(dist), ...findSitemapProblems(dist)];
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`dist OK (${htmlFiles(dist).length} pages)`);
}

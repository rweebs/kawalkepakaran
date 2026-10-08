import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROUTES } from '../src/i18n';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';
import { legacyTarget } from '../src/lib/legacy-redirects';
import { EVENTS } from '../src/lib/linimasa';
import { EVENTS_EN } from '../src/lib/linimasa-en';

const read = (p: string) => readFileSync(p, 'utf8');

describe('the PageSpeed page is gone', () => {
  it.each(['src/pages/pagespeed.astro', 'src/pages/en/pagespeed.astro'])('%s does not exist', (p) => {
    expect(existsSync(p), p).toBe(false);
  });
  it('the route table, menu, sitemap and lastmod table no longer mention it', () => {
    expect(Object.keys(ROUTES)).not.toContain('pagespeed');
    for (const n of NAV) expect(n.href, n.href).not.toMatch(/pagespeed/);
    expect(Object.keys(PAGE_LASTMOD).join(' ')).not.toMatch(/pagespeed/);
    expect(read('src/pages/sitemap.xml.ts')).not.toMatch(/pagespeed/i);
  });
  it('old PageSpeed URLs land on the home page of their language', () => {
    expect(legacyTarget('/pagespeed')).toBe('/');
    expect(legacyTarget('/pagespeed/')).toBe('/');
    expect(legacyTarget('/en/pagespeed')).toBe('/en');
    expect(legacyTarget('/pagespeed-lain')).toBe('/pagespeed-lain');
  });
  it('public/_redirects carries the rules', () => {
    const body = read('public/_redirects');
    expect(body).toContain('/pagespeed / 301');
    expect(body).toContain('/en/pagespeed /en 301');
  });
});

describe('the timeline (linimasa) is untouched except for dead PageSpeed links', () => {
  it('keeps its pages and route', () => {
    expect(ROUTES.timeline.id).toBe('/kasus/abil-sudarman/linimasa');
    expect(existsSync('src/pages/kasus/abil-sudarman/linimasa.astro')).toBe(true);
    expect(existsSync('src/pages/en/cases/abil-sudarman/timeline.astro')).toBe(true);
  });
  it('keeps every entry, including the two that mention PageSpeed in their text', () => {
    expect(EVENTS.length).toBeGreaterThan(20);
    expect(EVENTS.some((e) => /PageSpeed/.test(e.title))).toBe(true);
  });
  it('no entry links to the removed page', () => {
    for (const e of EVENTS) for (const r of e.related) expect(r.href, e.slug).not.toMatch(/pagespeed/);
  });
  it('every Indonesian related link still has an English label, so none is left dangling', () => {
    for (const e of EVENTS) expect(EVENTS_EN[e.slug].rel.length, e.slug).toBe(e.related.length);
  });
});

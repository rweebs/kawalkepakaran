import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { EVENTS, eventUrl, formatDate, getEvent, groupByMonth, neighbours } from '../src/lib/linimasa';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('linimasa events', () => {
  it('has unique kebab-case slugs and valid dates in chronological order', () => {
    const slugs = EVENTS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const e of EVENTS) {
      expect(e.slug, e.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(e.date, e.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(e.date)), e.slug).toBe(false);
    }
    const dates = EVENTS.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });
  it('is written in first person and every entry has text', () => {
    for (const e of EVENTS) {
      expect(e.title, e.slug).toMatch(/^Saya /);
      expect(e.paragraphs.length, e.slug).toBeGreaterThan(0);
      expect(e.paragraphs.join(' '), e.slug).toMatch(/\bsaya\b/i);
    }
  });
  it('does not label entries with the word "tuduhan"', () => {
    for (const e of EVENTS) expect(`${e.title} ${e.paragraphs.join(' ')}`, e.slug).not.toMatch(/tuduh/i);
  });
  it('keeps the unflattering events instead of dropping them', () => {
    expect(getEvent('balasan-berulang-di-threads')).toBeDefined();
    expect(getEvent('unggahan-keras-13-juni')).toBeDefined();
    expect(getEvent('dikeluarkan-dari-grup-korika')).toBeDefined();
  });
  it('links only https sources and existing local pages', () => {
    for (const e of EVENTS) {
      for (const s of e.sources) expect(s.url, e.slug).toMatch(/^https:\/\//);
      for (const r of e.related) {
        if (r.href.startsWith('/artikel/')) expect(existsSync(`src/content/posts/${r.href.slice('/artikel/'.length)}.md`), r.href).toBe(true);
        else expect(['/artikel', '/bukti', '/hak-jawab', '/pagespeed'], r.href).toContain(r.href);
      }
    }
  });
});

describe('linimasa helpers', () => {
  it('formats dates in Indonesian', () => {
    expect(formatDate('2026-06-07')).toBe('7 Juni 2026');
    expect(formatDate('2026-10-04')).toBe('4 Oktober 2026');
  });
  it('groups by month and keeps order', () => {
    const groups = groupByMonth();
    expect(groups.map((g) => g.label)[0]).toBe('April 2026');
    expect(groups.flatMap((g) => g.items)).toEqual(EVENTS);
  });
  it('finds previous and next entries', () => {
    expect(neighbours(EVENTS[0].slug)).toEqual({ prev: undefined, next: EVENTS[1] });
    expect(neighbours(EVENTS[EVENTS.length - 1].slug).next).toBeUndefined();
    expect(eventUrl(EVENTS[0])).toBe(`/linimasa/${EVENTS[0].slug}`);
  });
});

describe('linimasa wiring', () => {
  it('has Linimasa in the menu', () => {
    expect(NAV.filter((n) => n.href === '/linimasa')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/linimasa')?.label).toBe('Linimasa');
  });
  it('has a lastmod and lists the index and every entry in the sitemap', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/linimasa']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const sitemap = read('src/pages/sitemap.xml.ts');
    expect(sitemap).toContain("path: '/linimasa'");
    expect(sitemap).toContain('EVENTS.map');
  });
  it('has an index page and a per-entry page that offers right of reply', () => {
    expect(read('src/pages/linimasa.astro')).toContain('groupByMonth');
    const detail = read('src/pages/linimasa/[slug].astro');
    expect(detail).toContain('getStaticPaths');
    expect(detail).toContain("localizedPath('reply'");
    expect(detail).not.toMatch(/tuduh/i);
  });
});

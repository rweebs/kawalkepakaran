import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tiktokSchema } from '../src/lib/schemas';
import { embedUrl, watchUrl, thumbSrc, sortTiktok, type TiktokEntry } from '../src/lib/tiktok';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');
const base = { tiktokId: '7675283070907485448', title: 'Judul', order: 1 };
const DIR = 'src/content/tiktok';
const entries: TiktokEntry[] = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: tiktokSchema.parse(JSON.parse(read(join(DIR, f)))) }));

describe('tiktokSchema', () => {
  it('accepts a valid entry', () => expect(tiktokSchema.safeParse(base).success).toBe(true));
  it('rejects non-numeric or too short ids, a fractional order and an empty title', () => {
    for (const id of ['abc', '123', '7675283070907485448x', '../x', '']) {
      expect(tiktokSchema.safeParse({ ...base, tiktokId: id }).success, id).toBe(false);
    }
    expect(tiktokSchema.safeParse({ ...base, order: 1.5 }).success).toBe(false);
    expect(tiktokSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
});

describe('url helpers', () => {
  it('builds the embed and watch urls', () => {
    expect(embedUrl('123')).toBe('https://www.tiktok.com/embed/v2/123');
    expect(watchUrl('123')).toBe('https://www.tiktok.com/@rweebs_/video/123');
    expect(thumbSrc('123')).toBe('/img/tiktok-123.jpg');
  });
  it('sorts by order then id', () => {
    const e = (id: string, order: number): TiktokEntry => ({ id, data: tiktokSchema.parse({ ...base, order }) });
    expect(sortTiktok([e('b', 2), e('c', 1), e('a', 2)]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('tiktok content', () => {
  it('has 44 unique videos, each with a committed cover image and a unique title', () => {
    expect(entries).toHaveLength(44);
    expect(new Set(entries.map((e) => e.data.tiktokId)).size).toBe(44);
    expect(new Set(entries.map((e) => e.data.title)).size).toBe(44);
    for (const e of entries) expect(existsSync(`public${thumbSrc(e.data.tiktokId)}`), e.data.tiktokId).toBe(true);
  });
});

describe('tiktok wiring', () => {
  it('has TikTok in the menu', () => {
    expect(NAV.filter((n) => n.href === '/tiktok')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/tiktok')?.label).toBe('TikTok');
  });
  it('has a lastmod, a sitemap entry and a registered collection', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/tiktok']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/tiktok'");
    expect(read('src/content.config.ts')).toMatch(/tiktok:\s*defineCollection/);
  });
  it('allows only the exact tiktok.com frame source, with no wildcard', () => {
    const csp = read('public/_headers').match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? '';
    const frame = csp.match(/frame-src([^;]*)/)?.[1] ?? '';
    expect(frame).toContain('https://www.tiktok.com');
    expect(frame).not.toContain('*');
  });
  it('renders no iframe in markup, has a no-JS watch link, and removes the player on close', () => {
    const page = read('src/pages/tiktok.astro');
    expect(page).not.toMatch(/<iframe/);
    expect(page).toContain('watchUrl');
    expect(page).toContain('<dialog');
    const js = read('src/scripts/tiktok-modal.ts');
    expect(js).toContain('embedUrl');
    expect(js).toMatch(/addEventListener\('close'/);
  });
});

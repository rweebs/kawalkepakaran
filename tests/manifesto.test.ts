import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROUTES } from '../src/i18n';
import { NAV } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');
const page = () => read('src/pages/manifesto.astro');
const count = (s: string, needle: string) => s.split(needle).length - 1;

const TWEET_IMG = 'public/img/manifesto-tweet-ibamarief.png';

describe('manifesto tweet image', () => {
  it('exists and is cropped to the two posts of the thread, leaving out the reply of an unrelated account', async () => {
    expect(existsSync(TWEET_IMG)).toBe(true);
    const { default: sharp } = await import('sharp');
    const m = await sharp(TWEET_IMG).metadata();
    expect(m.width).toBe(1086);
    expect(m.height!).toBeGreaterThan(900);
    expect(m.height!).toBeLessThanOrEqual(1100); // the original is 1520 tall; the reply starts near 1095
  });
  it('is shown with alt text, a fixed size, lazy loading and a link to the source', () => {
    const s = page();
    expect(s).toContain('/img/manifesto-tweet-ibamarief.png');
    expect(s).toMatch(/<img[^>]*src="\/img\/manifesto-tweet-ibamarief\.png"[^>]*alt=\{T\.imgAlt\}/s);
    expect(s).toMatch(/<img[^>]*width="1086"[^>]*height="\d+"/s);
    expect(s).toContain('loading="lazy"');
  });
  it('has a caption saying what it shows, what it does not prove, and that the reply was cropped, in both languages', () => {
    const s = page();
    for (const k of ['Menunjukkan:', 'Tidak membuktikan:', 'dipotong', 'Shows:', 'Does not prove:', 'cropped']) {
      expect(s, k).toContain(k);
    }
  });
  it('the English alt text assumes no pronoun for a real person', () => {
    const alt = /imgAlt: '([^']*)'/g;
    const all = [...page().matchAll(alt)].map((m) => m[1]).join(' ');
    expect(all).not.toMatch(/\b(he|his|him|she|her)\b/i);
  });
});

describe('manifesto page', () => {
  it('has a route in both languages, both page files, a menu entry and a sitemap entry', () => {
    expect(ROUTES.manifesto).toEqual({ id: '/manifesto', en: '/en/manifesto' });
    expect(existsSync('src/pages/manifesto.astro')).toBe(true);
    expect(existsSync('src/pages/en/manifesto.astro')).toBe(true);
    expect(NAV.map((n) => n.href)).toContain('/manifesto');
    expect(read('src/pages/sitemap.xml.ts')).toContain("'/manifesto'");
  });
  it('states the seven principles in both languages', () => {
    const s = page();
    for (const k of ['Kami memeriksa orang dan klaimnya', 'We check people and their claims', 'Kami tidak menghukum', 'We do not punish']) {
      expect(s, k).toContain(k);
    }
    expect(s).not.toContain('bukan orangnya');
    expect(s).not.toContain('not people');
  });
  it('cites both sources by address', () => {
    const s = page();
    expect(s).toContain('https://x.com/ibamarief/status/1708488529427476635');
    expect(s).toContain('https://www.niaga.asia/perkara-korupsi-chromebook-pt-dki-perberat-hukuman-ibrahim-arief-jadi-5-tahun/');
  });
  it('quotes the thread in prose only by its short phrase, once per language (the image alt text only describes the image)', () => {
    const prose = page().split('\n').filter((l) => !l.trim().startsWith('imgAlt:')).join('\n');
    expect(count(prose, 'never-hire list')).toBeLessThanOrEqual(2);
    expect(prose).toContain('never-hire list');
  });
  it('says "divonis" / "sentenced" with the court and date, and does not call the person a final convict', () => {
    const s = page();
    for (const k of ['divonis', '12 Mei 2026', '31 Agustus 2026', 'berkekuatan tetap', 'May 12, 2026', 'August 31, 2026', 'whether the ruling is final']) {
      expect(s, k).toContain(k);
    }
    expect(s).not.toMatch(/Ibrahim Arief[^.]{0,80}terpidana/);
    expect(s).not.toMatch(/convicted offender|a convict/i);
  });
  it('keeps the thread and the ruling apart, and offers the right of reply', () => {
    const s = page();
    expect(s).toContain('tidak memakai putusan itu untuk menilai tweet');
    expect(s).toContain('do not use the ruling to judge the thread');
    expect(s).toMatch(/routePath\('reply'/);
  });
  it('English text never assumes a pronoun for a real person', () => {
    const en = page().slice(page().indexOf('en: {'));
    expect(en).not.toMatch(/\b(he|his|him|himself|she|her|hers)\b/i);
  });
});

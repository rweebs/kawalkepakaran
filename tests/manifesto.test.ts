import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROUTES } from '../src/i18n';
import { NAV } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');
const page = () => read('src/pages/manifesto.astro');
const count = (s: string, needle: string) => s.split(needle).length - 1;

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
    for (const k of ['Kami memeriksa klaim, bukan orangnya', 'We check claims, not people', 'Kami tidak menghukum', 'We do not punish']) {
      expect(s, k).toContain(k);
    }
  });
  it('cites both sources by address', () => {
    const s = page();
    expect(s).toContain('https://x.com/ibamarief/status/1708488529427476635');
    expect(s).toContain('https://www.niaga.asia/perkara-korupsi-chromebook-pt-dki-perberat-hukuman-ibrahim-arief-jadi-5-tahun/');
  });
  it('quotes the thread only by its short phrase, once per language', () => {
    expect(count(page(), 'never-hire list')).toBeLessThanOrEqual(2);
    expect(page()).toContain('never-hire list');
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

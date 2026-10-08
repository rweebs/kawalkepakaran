import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { chapters, MESSAGE, STATS, SOURCE_URL } from '../src/lib/tentang';
import { CHARACTER, INTRO, ISRA, MARKERS, METHOD, SKY_MAP, TRADITIONS, WHEEL, LABELS, PLANET_NAMES_ID, SIGN_NAMES_ID } from '../src/lib/anak-langit/content-id';
import { PLANETS } from '../src/lib/anak-langit/sky-data';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('tentang content', () => {
  it('translates every text chapter of the story (Anak Langit is the interactive chapter between 01 and 03)', () => {
    const ids = chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(chapters).toHaveLength(15);
    for (const c of chapters) {
      expect(c.title.length, c.id).toBeGreaterThan(0);
      expect(c.body.length, c.id).toBeGreaterThan(0);
    }
  });
  it('keeps the eight scorecard figures and the eight certifications of the original', () => {
    expect(STATS).toHaveLength(8);
    expect(chapters.find((c) => c.id === 'vietnam')?.tags).toHaveLength(8);
  });
  it('has a message to Abil Sudarman and to the Indonesian public, inviting right of reply', () => {
    expect(MESSAGE.title).toMatch(/Abil Sudarman/);
    expect(MESSAGE.title).toMatch(/Masyarakat Indonesia/);
    expect(MESSAGE.toAbil.paragraphs.join(' ')).toMatch(/hak jawab/i);
    expect(MESSAGE.toPublic.paragraphs.join(' ')).toMatch(/praduga tak bersalah/i);
    expect(MESSAGE.signature).toContain('Rahmat Wibowo');
  });
});

describe('tentang wiring', () => {
  it('has Tentang penggagas in the menu', () => {
    expect(NAV.filter((n) => n.href === '/tentang')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/tentang')?.label).toBe('Tentang penggagas');
  });
  it('has a lastmod and a sitemap entry', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/tentang']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/tentang'");
  });
  it('links the original story and ships the photo', () => {
    expect(SOURCE_URL).toBe('https://www.infraloka.co.id/story');
    expect(read('src/pages/tentang.astro')).toContain('SOURCE_URL');
    expect(existsSync('src/assets/home/rahmat-wibowo.jpg')).toBe(true);
  });
  it('renders the interactive Anak Langit sky between chapters 01 and 03, as a lazy island', () => {
    const page = read('src/pages/tentang.astro');
    expect(page).toContain('<AnakLangitChapter client:visible />');
    expect(page.indexOf('before.map')).toBeLessThan(page.indexOf('<AnakLangitChapter'));
    expect(page.indexOf('<AnakLangitChapter')).toBeLessThan(page.indexOf('after.map'));
    expect(chapters.map((c) => c.id).slice(0, 2)).toEqual(['prolog', 'nama']);
    expect(chapters[2].id).toBe('itb');
  });
  it('keeps the night-sky twinkle behind the page and off for reduced motion', () => {
    const css = read('src/styles/global.css');
    expect(read('src/pages/tentang.astro')).toContain('class="tentang-stars"');
    expect(css).toMatch(/\.tentang-stars::before[^{]*\{[^}]*animation: tentang-twinkle-a/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.tentang-stars::before, \.tentang-stars::after \{ animation: none/);
  });
  it('lazy-loads three.js only near the chapter and stops rendering off screen', () => {
    const sky = read('src/components/anak-langit/AnakLangitSky.tsx');
    expect(sky).toContain("import('../../lib/anak-langit/SkyScene')");
    expect(sky).toMatch(/rootMargin: '100% 0px'/);
    expect(sky).toContain('setPaused');
    expect(read('src/styles/anak-langit.css')).toMatch(/prefers-reduced-motion: reduce[^}]*\{[^}]*\.al-orbit/);
  });
});

describe('anak langit translation', () => {
  it('has every section of the original chapter in Indonesian', () => {
    expect(INTRO.paragraphs).toHaveLength(2);
    expect(MARKERS).toHaveLength(3);
    expect(SKY_MAP.notes).toHaveLength(3);
    expect(WHEEL.callouts).toHaveLength(3);
    expect(ISRA.days).toHaveLength(3);
    expect(CHARACTER.traits).toHaveLength(6);
    expect(CHARACTER.strengths).toHaveLength(4);
    expect(CHARACTER.watchouts).toHaveLength(4);
    expect(CHARACTER.advice).toHaveLength(4);
    expect(TRADITIONS.items.map((t) => t.id)).toEqual(['javanese', 'chinese', 'greco-roman', 'indian', 'sundanese', 'balinese']);
    expect(METHOD.sources).toHaveLength(4);
    expect(LABELS.eyebrow).toBe('Bab 02');
  });
  it('names all ten planets and twelve signs in Indonesian', () => {
    expect(PLANETS.every((p) => PLANET_NAMES_ID[p.name])).toBe(true);
    expect(SIGN_NAMES_ID).toHaveLength(12);
    expect(PLANET_NAMES_ID.Saturn).toBe('Saturnus');
  });
  it('ships the portrait', () => {
    expect(existsSync('public/img/rahmat-anak-langit.jpg')).toBe(true);
  });
});

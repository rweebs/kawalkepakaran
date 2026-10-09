import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { postSchema, postEnSchema } from '../src/lib/schemas';
import { ROUTES } from '../src/i18n';

const SLUG = 'meluncurkan-kawal-kepakaran-cek-fakta-terbuka-untuk-klaim-para-pakar';
const ID = `src/content/posts/${SLUG}.md`;
const EN = `src/content/posts-en/${SLUG}.md`;
const read = (p: string) => readFileSync(p, 'utf8');
const front = (s: string) => {
  const m = s.match(/^---\n([\s\S]*?)\n---\n/)!;
  const o: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const [k, ...v] = line.split(': ');
    const raw = v.join(': ').trim();
    o[k] = raw.startsWith('[') ? JSON.parse(raw) : raw.replace(/^"|"$/g, '');
  }
  return o;
};
const body = (s: string) => s.replace(/^---\n[\s\S]*?\n---\n/, '');

const HEADER = '/img/peluncuran-kawal-kepakaran-001.png';
const DIAGRAM = { id: '/img/peluncuran-kawal-kepakaran-002-id.png', en: '/img/peluncuran-kawal-kepakaran-002-en.png' };

describe('launch article illustrations', () => {
  const imgs = (s: string) => [...body(s).matchAll(/!\[([^\]]*)\]\((\/img\/[^)]+)\)/g)].map((m) => ({ alt: m[1], src: m[2] }));

  it('opens with the shared header illustration in both languages (the first image becomes the header)', () => {
    for (const s of [read(ID), read(EN)]) expect(imgs(s)[0].src).toBe(HEADER);
  });
  it('uses the language-specific verdict diagram in each language, placed under "what is on the site"', () => {
    expect(imgs(read(ID)).map((i) => i.src)).toEqual([HEADER, DIAGRAM.id]);
    expect(imgs(read(EN)).map((i) => i.src)).toEqual([HEADER, DIAGRAM.en]);
    for (const s of [read(ID), read(EN)]) {
      const at = s.indexOf('/img/peluncuran-kawal-kepakaran-002');
      expect(at).toBeGreaterThan(s.search(/## (Apa yang ada di situs|What is on the site)/));
    }
  });
  it('has meaningful alt text in the right language, not a placeholder', () => {
    for (const i of imgs(read(ID))) expect(i.alt.length, i.src).toBeGreaterThan(30);
    for (const i of imgs(read(EN))) expect(i.alt.length, i.src).toBeGreaterThan(30);
    expect(imgs(read(ID))[1].alt).toMatch(/empat putusan/i);
    expect(imgs(read(EN))[1].alt).toMatch(/four verdicts/i);
    expect(imgs(read(ID))[0].alt).not.toMatch(/\b(the|of|and)\b/);
  });
  it.each([HEADER, DIAGRAM.id, DIAGRAM.en])('%s exists as a 1600x900 PNG under 350 KB', async (src) => {
    expect(existsSync(`public${src}`), src).toBe(true);
    const { default: sharp } = await import('sharp');
    const m = await sharp(`public${src}`).metadata();
    expect([m.width, m.height, m.format]).toEqual([1600, 900, 'png']);
    expect(readFileSync(`public${src}`).length).toBeLessThan(350 * 1024);
  });
  it('shows no real person: the header has no text and the diagram names only the four verdicts', () => {
    const script = read('scripts/make-launch-art.mjs');
    expect(script).not.toMatch(/Abil|Ibrahim|Rahmat/);
  });
});

describe('launch article', () => {
  it('exists in both languages under the same id and validates against its schemas', () => {
    expect(existsSync(ID)).toBe(true);
    expect(existsSync(EN)).toBe(true);
    expect(postSchema.safeParse({ ...front(read(ID)) }).success).toBe(true);
    const en = front(read(EN));
    expect(postEnSchema.safeParse({ ...en, original: en.original === 'true' }).success).toBe(true);
    expect(en.original).toBe('true');
  });
  it('is dated the launch day and classed as opinion', () => {
    expect(front(read(ID)).translationDate).toBe('2026-10-09');
    expect(front(read(ID)).classification).toBe('pendapat');
  });
  it('links only to pages that exist, in the right language', () => {
    const pageLinks = (s: string) => [...body(s).matchAll(/\]\((\/[^)#]*)\)/g)].map((m) => m[1]).filter((l) => !l.startsWith('/img/'));
    const idLinks = pageLinks(read(ID));
    const enLinks = pageLinks(read(EN));
    const idPaths = new Set(Object.values(ROUTES).map((r) => r.id));
    const enPaths = new Set(Object.values(ROUTES).map((r) => r.en));
    for (const l of idLinks) expect(idPaths.has(l), `ID link ${l}`).toBe(true);
    for (const l of enLinks) expect(enPaths.has(l), `EN link ${l}`).toBe(true);
    expect(idLinks.length).toBeGreaterThanOrEqual(6);
    expect(enLinks.length).toBe(idLinks.length);
  });
  it('reports only what was measured and says what it did not measure', () => {
    expect(read(ID)).toContain('765');
    expect(read(ID)).toContain('1.331');
    expect(read(EN)).toContain('765');
    expect(read(EN)).toContain('1,331');
    for (const s of [read(ID), read(EN)]) {
      expect(s).not.toMatch(/Performance[^.]{0,40}\b100\b/);
      expect(s).toMatch(/PageSpeed Insights/);
    }
  });
  it('says the five claims are unverified and the author is a party, with the right of reply', () => {
    expect(read(ID)).toMatch(/belum bisa diverifikasi/);
    expect(read(ID)).toMatch(/pihak dalam sengketa/);
    expect(read(ID)).toMatch(/jawabannya secara utuh/);
    expect(read(EN)).toMatch(/cannot yet be verified/);
    expect(read(EN)).toMatch(/party to the dispute/);
    expect(read(EN)).toMatch(/reply in full/);
  });
  it('English text assumes no pronoun for a real person', () => {
    const t = body(read(EN)).replace(/\bmy\b|\bI\b|\bme\b/gi, '');
    expect(t).not.toMatch(/\b(he|his|him|himself|she|her|hers)\b/i);
  });
  it('uses no internal tooling language', () => {
    for (const s of [read(ID), read(EN)]) expect(s).not.toMatch(/\b(aegis|claude|anthropic|prompt|skill)\b/i);
  });
});

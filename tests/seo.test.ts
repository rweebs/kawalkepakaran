import { describe, it, expect } from 'vitest';
import { truncateAtWord, buildTitle, descriptionFromMarkdown, breadcrumbLd } from '../src/lib/seo';

describe('truncateAtWord', () => {
  it('leaves short text alone', () => {
    expect(truncateAtWord('Halo dunia', 20)).toBe('Halo dunia');
  });
  it('cuts at a word boundary with an ellipsis within the limit', () => {
    const out = truncateAtWord('Satu dua tiga empat lima enam tujuh delapan', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
    expect('Satu dua tiga empat lima enam tujuh delapan').toContain(out.slice(0, -1));
  });
  it('collapses whitespace', () => {
    expect(truncateAtWord('a   b\n c', 20)).toBe('a b c');
  });
});

describe('buildTitle', () => {
  const brand = 'Kawal Abil Sudarman';
  it('returns the brand alone when the title is the brand', () => {
    expect(buildTitle(brand, brand, 'Kawal')).toBe(brand);
  });
  it('appends the full brand when it fits in 60 characters', () => {
    expect(buildTitle('Operasi Ababil', brand, 'Kawal')).toBe('Operasi Ababil · Kawal Abil Sudarman');
  });
  it('suffixes a truncated title with the subject when the title does not name it', () => {
    const out = buildTitle('Saya menulis unggahan dengan bahasa sangat keras tentang pihak lain di media sosial', brand, 'Kawal');
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith(' · Abil Sudarman')).toBe(true);
  });
  it('falls back to the short brand and truncates a long title to 60 characters', () => {
    const long = 'Laporan Investigasi: Membedah Kredensial Abil Sudarman dan Perusahaannya Secara Mendalam';
    const out = buildTitle(long, brand, 'Kawal');
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith(' · Kawal')).toBe(true);
    expect(out).toContain('…');
  });
});

describe('descriptionFromMarkdown', () => {
  const md = `---
title: "x"
---
![gambar](/img/a.png)

# Judul

*Tulisan ini menjelaskan mengapa saya menyebut [Bapak Abil](https://example.com) sebagai terlapor dalam aduan publik saya kepada kepolisian.* Ini catatan saya.

Paragraf kedua yang tidak dipakai.`;
  it('strips markup and uses the first substantial paragraph', () => {
    const d = descriptionFromMarkdown(md, 155);
    expect(d.startsWith('Tulisan ini menjelaskan mengapa saya menyebut Bapak Abil sebagai terlapor')).toBe(true);
    expect(d).not.toMatch(/[*\[\]()#]/);
    expect(d.length).toBeLessThanOrEqual(155);
  });
  it('returns an empty string when nothing substantial exists', () => {
    expect(descriptionFromMarkdown('![x](/img/a.png)\n\n# H\n\npendek')).toBe('');
  });
});

describe('breadcrumbLd', () => {
  it('numbers the items from 1', () => {
    const ld = breadcrumbLd([{ name: 'Beranda', url: 'https://x.id/' }, { name: 'Artikel', url: 'https://x.id/artikel' }]) as any;
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i: any) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1].item).toBe('https://x.id/artikel');
  });
});

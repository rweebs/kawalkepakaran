import { describe, it, expect } from 'vitest';
import { truncateAtWord, buildTitle, htmlLength, TITLE_MAX, distinctTitles, distinctDescriptions, descriptionFromMarkdown, breadcrumbLd } from '../src/lib/seo';

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
  const brand = 'Kawal Kepakaran';
  it('returns the brand alone when the title is the brand', () => {
    expect(buildTitle(brand, brand)).toBe(brand);
  });
  it('appends the full brand when it fits in 65 characters', () => {
    expect(TITLE_MAX).toBe(65);
    expect(buildTitle('Operasi Ababil', brand)).toBe('Operasi Ababil · Kawal Kepakaran');
  });
  it('keeps the full brand on a truncated title that does not name the brand', () => {
    const out = buildTitle('Saya menulis unggahan dengan bahasa sangat keras tentang pihak lain di media sosial', brand);
    expect(out.length).toBeLessThanOrEqual(65);
    expect(out.endsWith('… · Kawal Kepakaran')).toBe(true);
  });
  it('keeps the full brand on a truncated title that already names the brand', () => {
    const out = buildTitle('Launching Kawal Kepakaran: An Open Fact-Check of Experts\' Claims Everywhere', brand);
    expect(out.length).toBeLessThanOrEqual(65);
    expect(out.endsWith('… · Kawal Kepakaran')).toBe(true);
    expect(out).not.toMatch(/ · Kawal$| · Kepakaran$/);
  });
  it('counts characters that grow in HTML, so the escaped title stays within 65', () => {
    const out = buildTitle("The Phantom CEO: Why Fraud Is Gen Z's Fastest-Growing Side Hustle & More", brand);
    expect(htmlLength(out)).toBeLessThanOrEqual(65);
    expect(htmlLength("a'b&c")).toBe(5 + 4 + 4);
  });
  it('keeps a trailing collision number when it cuts', () => {
    const out = buildTitle('Laporan Investigasi: Membedah Kredensial Seorang Pakar Secara Mendalam #2', brand);
    expect(out.endsWith('… #2 · Kawal Kepakaran')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(65);
  });
});

describe('distinctTitles / distinctDescriptions', () => {
  const brand = 'Kawal Kepakaran';
  const a = { id: 'a', title: 'CEO Hantu: Mengapa Penipuan Menjadi Pekerjaan Sampingan Gen Z, Oleh Penulis', description: 'Sama.' };
  const b = { id: 'b', title: 'CEO Hantu: Mengapa Penipuan Menjadi Pekerjaan Sampingan Gen Z: Tiga Nama', description: 'Sama.' };
  const c = { id: 'c', title: 'Judul pendek', description: 'Lain.' };
  it('numbers only the titles that would collide once cut, and every resulting <title> is unique', () => {
    const m = distinctTitles([b, a, c], brand);
    expect(m.get('a')!.endsWith(' #1')).toBe(true);
    expect(m.get('b')!.endsWith(' #2')).toBe(true);
    expect(m.get('c')).toBe('Judul pendek');
    const built = [...m.values()].map((t) => buildTitle(t, brand));
    expect(new Set(built).size).toBe(3);
  });
  it('puts the title in front of a shared description only', () => {
    const m = distinctDescriptions([a, b, c]);
    expect(m.get('c')).toBe('Lain.');
    expect(m.get('a')).not.toBe(m.get('b'));
    expect(m.get('a')!.startsWith('CEO Hantu')).toBe(true);
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

import { describe, it, expect } from 'vitest';
import { bukuSchema } from '../src/lib/schemas';
import { formatBytes, sortBuku, type BukuEntry } from '../src/lib/buku';

const base = {
  title: 'Judul', author: 'Penulis', pages: 10,
  file: '/buku/contoh.pdf', cover: '/img/buku-contoh.jpg',
  description: 'Isi dokumen', note: 'Batas cakupan', order: 1,
};

describe('bukuSchema', () => {
  it('accepts a minimal entry and one with date and version', () => {
    expect(bukuSchema.safeParse(base).success).toBe(true);
    expect(bukuSchema.safeParse({ ...base, date: '2026-09-12', version: '1.5' }).success).toBe(true);
  });
  it('rejects a file that is not a pdf under /buku/, including path tricks', () => {
    for (const f of ['/buku/x.txt', '/img/x.pdf', '../x.pdf', '/buku/../x.pdf', '/buku/a/b.pdf', 'https://x.test/a.pdf', '/buku/.pdf']) {
      expect(bukuSchema.safeParse({ ...base, file: f }).success, f).toBe(false);
    }
  });
  it('rejects a cover outside /img/buku-*.jpg', () => {
    for (const c of ['/img/x.jpg', '/img/buku-x.png', '/thumb/buku-x.jpg', '/img/buku-.jpg']) {
      expect(bukuSchema.safeParse({ ...base, cover: c }).success, c).toBe(false);
    }
  });
  it('rejects zero or fractional pages and empty text fields', () => {
    expect(bukuSchema.safeParse({ ...base, pages: 0 }).success).toBe(false);
    expect(bukuSchema.safeParse({ ...base, pages: 2.5 }).success).toBe(false);
    for (const k of ['title', 'author', 'description', 'note'] as const) {
      expect(bukuSchema.safeParse({ ...base, [k]: '' }).success, k).toBe(false);
    }
  });
});

describe('formatBytes', () => {
  it('formats megabytes with a decimal comma and one digit', () => {
    expect(formatBytes(10 * 1048576)).toBe('10,0 MB');
    expect(formatBytes(Math.round(13.6 * 1048576))).toBe('13,6 MB');
  });
  it('formats files under one megabyte in kilobytes', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(1)).toBe('1 KB');
  });
});

describe('sortBuku', () => {
  const e = (id: string, order: number): BukuEntry => ({ id, data: bukuSchema.parse({ ...base, order }) });
  it('sorts by order then id without mutating the input', () => {
    const input = [e('b', 2), e('a', 2), e('c', 1)];
    expect(sortBuku(input).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(input.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});

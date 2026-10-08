import { describe, it, expect } from 'vitest';
import { buktiSchema } from '../src/lib/schemas';
import { BUKTI_GROUPS, groupBukti, thumbFor, sourceLine, type BuktiEntry } from '../src/lib/bukti';

const base = {
  title: 'Contoh', group: 'catatan-resmi',
  images: [{ src: '/img/x.png', alt: 'alt' }],
  shows: 'apa yang terlihat', limits: 'apa yang tidak dibuktikan', order: 1,
};

describe('buktiSchema', () => {
  it('accepts a minimal entry', () => {
    expect(buktiSchema.safeParse(base).success).toBe(true);
  });
  it('rejects an unknown group', () => {
    expect(buktiSchema.safeParse({ ...base, group: 'catatan' }).success).toBe(false);
  });
  it('rejects zero images and more than four', () => {
    expect(buktiSchema.safeParse({ ...base, images: [] }).success).toBe(false);
    const five = Array.from({ length: 5 }, (_, i) => ({ src: `/img/${i}.png`, alt: 'a' }));
    expect(buktiSchema.safeParse({ ...base, images: five }).success).toBe(false);
  });
  it('rejects an image path outside /img/', () => {
    expect(buktiSchema.safeParse({ ...base, images: [{ src: '/source/x.png', alt: 'a' }] }).success).toBe(false);
    expect(buktiSchema.safeParse({ ...base, images: [{ src: 'https://x.test/a.png', alt: 'a' }] }).success).toBe(false);
  });
  it('rejects empty shows, limits or alt', () => {
    expect(buktiSchema.safeParse({ ...base, shows: '' }).success).toBe(false);
    expect(buktiSchema.safeParse({ ...base, limits: '' }).success).toBe(false);
    expect(buktiSchema.safeParse({ ...base, images: [{ src: '/img/x.png', alt: '' }] }).success).toBe(false);
  });
  it('rejects a non-integer order and a bad sourceUrl', () => {
    expect(buktiSchema.safeParse({ ...base, order: 1.5 }).success).toBe(false);
    expect(buktiSchema.safeParse({ ...base, sourceUrl: 'bukan url' }).success).toBe(false);
  });
  it('coerces capturedAt from an ISO date', () => {
    const r = buktiSchema.parse({ ...base, capturedAt: '2026-10-04' });
    expect(r.capturedAt).toBeInstanceOf(Date);
  });
});

const entry = (id: string, group: string, order: number): BuktiEntry =>
  ({ id, data: buktiSchema.parse({ ...base, group, order }) });

describe('groupBukti', () => {
  it('returns groups in the fixed order and sorts items by order then id', () => {
    const g = groupBukti([
      entry('b', 'upaya-verifikasi', 2), entry('a', 'upaya-verifikasi', 2), entry('c', 'catatan-resmi', 1), entry('d', 'upaya-verifikasi', 1),
    ]);
    expect(g.map((x) => x.id)).toEqual(['catatan-resmi', 'upaya-verifikasi']);
    expect(g[1].items.map((e) => e.id)).toEqual(['d', 'a', 'b']);
  });
  it('omits groups with no entries and handles an empty list', () => {
    expect(groupBukti([entry('a', 'liputan-pihak-ketiga', 1)]).map((x) => x.id)).toEqual(['liputan-pihak-ketiga']);
    expect(groupBukti([])).toEqual([]);
  });
  it('defines the four spec groups in order', () => {
    expect(BUKTI_GROUPS.map((g) => g.id)).toEqual(['catatan-resmi', 'klaim-yang-dipublikasikan', 'liputan-pihak-ketiga', 'upaya-verifikasi']);
  });
});

describe('thumbFor', () => {
  it('maps png and jpg originals to webp thumbnails', () => {
    expect(thumbFor('/img/abc.png')).toBe('/thumb/abc.webp');
    expect(thumbFor('/img/abc.jpg')).toBe('/thumb/abc.webp');
    expect(thumbFor('/img/abc.JPEG')).toBe('/thumb/abc.webp');
  });
});

describe('sourceLine', () => {
  it('says source and date are not visible when both are missing', () => {
    expect(sourceLine({})).toBe('Sumber dan tanggal tidak terlihat pada gambar.');
  });
  it('says the date is not visible when only the source is known', () => {
    expect(sourceLine({ source: 'LinkedIn' })).toBe('Sumber: LinkedIn. Tanggal tangkapan layar tidak terlihat.');
  });
  it('says the source is not visible when only the date is known', () => {
    const s = sourceLine({ capturedAt: new Date('2026-10-04') });
    expect(s).toContain('Oktober 2026');
    expect(s).toContain('Sumber tidak terlihat');
  });
  it('shows both when known and never prints Invalid Date', () => {
    const s = sourceLine({ source: 'ideafest.id', capturedAt: new Date('2026-10-04') });
    expect(s).toMatch(/^Sumber: ideafest\.id\. Tangkapan layar: .*2026\.$/);
    expect(s).not.toContain('Invalid');
  });
});

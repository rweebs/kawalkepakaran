import { describe, it, expect } from 'vitest';
import { firstImage, hueFromSlug } from '../src/lib/header-image';

describe('firstImage', () => {
  it('returns null when there is no image', () => {
    expect(firstImage('Hanya teks.')).toBeNull();
  });
  it('returns the first /img/ image with alt text', () => {
    const md = 'Teks\n\n![Gambar satu](/img/a.png)\n\n![Dua](/img/b.jpg)';
    expect(firstImage(md)).toEqual({ src: '/img/a.png', alt: 'Gambar satu' });
  });
  it('handles empty alt text', () => {
    expect(firstImage('![](/img/a.png)')).toEqual({ src: '/img/a.png', alt: '' });
  });
  it('ignores external images', () => {
    expect(firstImage('![x](https://example.com/a.png)')).toBeNull();
  });
  it('ignores frontmatter', () => {
    expect(firstImage('---\nimage: "![x](/img/fm.png)"\n---\n![ok](/img/real.png)')).toEqual({ src: '/img/real.png', alt: 'ok' });
  });
});

describe('hueFromSlug', () => {
  it('is deterministic and within 0-359', () => {
    const h = hueFromSlug('unmasking-abil-sudarman-ababil');
    expect(h).toBe(hueFromSlug('unmasking-abil-sudarman-ababil'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
  it('differs for different slugs', () => {
    expect(hueFromSlug('a')).not.toBe(hueFromSlug('b'));
  });
});

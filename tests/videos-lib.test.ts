import { describe, it, expect } from 'vitest';
import { videoSchema } from '../src/lib/schemas';
import { embedUrl, watchUrl, thumbSrc, sortVideos, type VideoEntry } from '../src/lib/videos';

const base = { youtubeId: 'AmPrGRv563Q', title: 'Judul', order: 1 };

describe('videoSchema', () => {
  it('accepts a minimal entry and one with start', () => {
    expect(videoSchema.safeParse(base).success).toBe(true);
    expect(videoSchema.safeParse({ ...base, start: 495 }).success).toBe(true);
  });
  it('rejects a bad youtube id', () => {
    for (const id of ['short', 'AmPrGRv563QX', 'AmPrGRv563!', '']) {
      expect(videoSchema.safeParse({ ...base, youtubeId: id }).success, id).toBe(false);
    }
  });
  it('rejects a negative or fractional start and a fractional order', () => {
    expect(videoSchema.safeParse({ ...base, start: -1 }).success).toBe(false);
    expect(videoSchema.safeParse({ ...base, start: 1.5 }).success).toBe(false);
    expect(videoSchema.safeParse({ ...base, order: 1.5 }).success).toBe(false);
  });
  it('rejects an empty title', () => {
    expect(videoSchema.safeParse({ ...base, title: '' }).success).toBe(false);
  });
});

describe('url helpers', () => {
  it('builds the privacy-enhanced embed url with and without start', () => {
    expect(embedUrl('AmPrGRv563Q')).toBe('https://www.youtube-nocookie.com/embed/AmPrGRv563Q?autoplay=1&rel=0');
    expect(embedUrl('AmPrGRv563Q', 486)).toBe('https://www.youtube-nocookie.com/embed/AmPrGRv563Q?autoplay=1&rel=0&start=486');
  });
  it('treats start 0 as no offset', () => {
    expect(embedUrl('AmPrGRv563Q', 0)).not.toContain('start');
    expect(watchUrl('AmPrGRv563Q', 0)).toBe('https://www.youtube.com/watch?v=AmPrGRv563Q');
  });
  it('builds the watch url with a t offset', () => {
    expect(watchUrl('Rp5MezetLvQ', 486)).toBe('https://www.youtube.com/watch?v=Rp5MezetLvQ&t=486s');
  });
  it('points the thumbnail at the self-hosted copy', () => {
    expect(thumbSrc('ZBUM-xj2Vs8')).toBe('/img/video-ZBUM-xj2Vs8.jpg');
  });
});

describe('sortVideos', () => {
  const e = (id: string, order: number): VideoEntry => ({ id, data: videoSchema.parse({ ...base, order }) });
  it('sorts by order then id and does not mutate the input', () => {
    const input = [e('b', 2), e('a', 2), e('c', 1)];
    expect(sortVideos(input).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(input.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });
});

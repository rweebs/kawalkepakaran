import { describe, it, expect } from 'vitest';
import { postSchema } from '../src/lib/schemas';

const basePost = {
  title: 'Judul', originalTitle: 'Title', author: 'Rahmat Wibowo',
  translationDate: '2026-10-04', classification: 'pendapat',
};

describe('postSchema', () => {
  it('accepts a draft without originalUrl', () => {
    expect(postSchema.safeParse(basePost).success).toBe(true);
  });
  it('accepts a final post without originalUrl (the notice says the link will be added)', () => {
    const r = postSchema.safeParse({ ...basePost, translationStatus: 'final' });
    expect(r.success).toBe(true);
  });
  it('accepts a final post with originalUrl', () => {
    const r = postSchema.safeParse({ ...basePost, translationStatus: 'final', originalUrl: 'https://example.com/a' });
    expect(r.success).toBe(true);
  });
  it('rejects an unknown classification', () => {
    expect(postSchema.safeParse({ ...basePost, classification: 'fakta' }).success).toBe(false);
  });
});

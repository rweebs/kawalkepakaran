import { describe, it, expect } from 'vitest';
import { SITE } from '../src/lib/site';
import { claimReviewLd, personLd, profilePageLd } from '../src/lib/schema-org';

const base = {
  url: 'https://kawalkepakaran.org/klaim/x', claim: 'Klaim', pakarName: 'P', verdictLabel: 'Sebagian', limits: 'Batas', locale: 'id' as const,
};

describe('claimReviewLd, extended', () => {
  it('keeps datePublished and dateModified distinct when both are given', () => {
    const ld = claimReviewLd({ ...base, datePublished: '2026-10-01', dateModified: '2026-10-09' });
    expect(ld.datePublished).toBe('2026-10-01');
    expect(ld.dateModified).toBe('2026-10-09');
  });
  it('falls back to datePublished for dateModified (backwards compatible)', () => {
    const ld = claimReviewLd({ ...base, datePublished: '2026-10-01' });
    expect(ld.dateModified).toBe('2026-10-01');
    expect(ld).not.toHaveProperty('image');
    expect(ld.itemReviewed).not.toHaveProperty('appearance');
  });
  it('emits the appearance, an absolute image, a headline and a named rating', () => {
    const ld = claimReviewLd({ ...base, datePublished: '2026-10-01', appearanceUrl: 'https://example.org/post', image: '/og/klaim/x-id.jpg' });
    expect(ld.itemReviewed.appearance).toEqual([{ '@type': 'CreativeWork', url: 'https://example.org/post' }]);
    expect(ld.itemReviewed.firstAppearance).toEqual({ '@type': 'CreativeWork', url: 'https://example.org/post' });
    expect(ld.image).toBe(`${SITE.url}/og/klaim/x-id.jpg`);
    expect(ld.headline).toBe('Sebagian: Klaim');
    expect(ld.reviewRating).toMatchObject({ name: 'Sebagian', alternateName: 'Sebagian' });
  });
  it('ties author and publisher to the source repository', () => {
    const ld = claimReviewLd({ ...base, datePublished: '2026-10-01' });
    expect(ld.author.sameAs).toEqual([SITE.repo]);
    expect(ld.publisher.sameAs).toEqual([SITE.repo]);
    expect(ld.author['@type']).toBe('Organization');
  });
  it('caps the headline at 110 characters', () => {
    const ld = claimReviewLd({ ...base, claim: 'x'.repeat(300), datePublished: '2026-10-01' });
    expect(ld.headline.length).toBe(110);
  });
});

describe('personLd and profilePageLd', () => {
  const input = {
    url: 'https://kawalkepakaran.org/pakar/x', name: 'A', field: 'AI', description: 'd', locale: 'en' as const,
    sameAs: ['https://a.example/1', undefined, 'https://a.example/1', 'https://b.example/2'],
  };
  it('gives the Person a jobTitle and deduplicated sameAs, and no inLanguage', () => {
    const p = personLd(input);
    expect(p).toMatchObject({ '@type': 'Person', jobTitle: 'AI', sameAs: ['https://a.example/1', 'https://b.example/2'] });
    expect(p).not.toHaveProperty('inLanguage');
  });
  it('omits sameAs when there are no sources', () => {
    expect(personLd({ ...input, sameAs: [] })).not.toHaveProperty('sameAs');
  });
  it('wraps the Person in a ProfilePage that carries the language', () => {
    const page = profilePageLd({ ...input, dateModified: '2026-10-09', image: '/og/pakar/x-en.jpg' });
    expect(page).toMatchObject({ '@type': 'ProfilePage', inLanguage: 'en', dateModified: '2026-10-09', image: `${SITE.url}/og/pakar/x-en.jpg` });
    expect(page.mainEntity).toMatchObject({ '@type': 'Person', '@id': 'https://kawalkepakaran.org/pakar/x#person' });
    expect(page.mainEntity).not.toHaveProperty('@context');
    expect(page.mainEntity).not.toHaveProperty('inLanguage');
  });
});

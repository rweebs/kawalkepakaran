import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE } from '../src/lib/site';
import { claimReviewLd, personLd, articleLd } from '../src/lib/schema-org';

const read = (p: string) => readFileSync(p, 'utf8');

describe('home title', () => {
  const home = read('src/pages/index.astro');
  it('names the topic, not only the brand, in both languages', () => {
    expect(home).toMatch(/title: 'Menguji klaim para pakar'/);
    expect(home).toMatch(/title: 'Checking what experts claim'/);
    expect(home).not.toMatch(/title: SITE\.name/);
  });
});

describe('claimReviewLd', () => {
  const ld = claimReviewLd({
    url: 'https://kawalkepakaran.org/klaim/x', claim: 'Gelar Computer Science dari University of London.', pakarName: 'Abil Sudarman',
    verdictLabel: 'Belum bisa diverifikasi', limits: 'Belum adanya konfirmasi tidak membuktikan gelar itu tidak ada.',
    datePublished: '2026-10-09', locale: 'id',
  });
  it('is a ClaimReview with the claim, its author, and a text rating', () => {
    expect(ld['@type']).toBe('ClaimReview');
    expect(ld.claimReviewed).toBe('Gelar Computer Science dari University of London.');
    expect(ld.itemReviewed.author).toEqual({ '@type': 'Person', name: 'Abil Sudarman' });
    expect(ld.reviewRating).toEqual({ '@type': 'Rating', alternateName: 'Belum bisa diverifikasi' });
  });
  it('is authored by the site, not by a person, and never invents a numeric rating', () => {
    expect(ld.author).toEqual({ '@type': 'Organization', name: SITE.name, url: SITE.url });
    expect(JSON.stringify(ld)).not.toMatch(/ratingValue|bestRating|worstRating/);
  });
  it('states the limits as the review body and omits the claim date when unknown', () => {
    expect(ld.reviewBody).toContain('Belum adanya konfirmasi');
    expect(ld.itemReviewed).not.toHaveProperty('datePublished');
  });
  it('carries the claim date when known, and survives JSON round-trip', () => {
    const withDate = claimReviewLd({ url: 'u', claim: 'c', pakarName: 'p', verdictLabel: 'v', limits: 'l', datePublished: '2026-10-09', locale: 'en', claimMadeAt: '2026-04-28' });
    expect(withDate.itemReviewed.datePublished).toBe('2026-04-28');
    expect(JSON.parse(JSON.stringify(withDate))).toEqual(withDate);
  });
});

describe('personLd and articleLd', () => {
  it('describes a pakar as a Person with a url and a field', () => {
    const p = personLd({ url: 'https://kawalkepakaran.org/pakar/x', name: 'Abil Sudarman', field: 'AI', description: 'd', locale: 'id' });
    expect(p).toMatchObject({ '@type': 'Person', name: 'Abil Sudarman', url: 'https://kawalkepakaran.org/pakar/x', knowsAbout: 'AI' });
  });
  it('describes the manifesto as an Article by the founder with a date', () => {
    const a = articleLd({ url: 'u', headline: 'Bukan Daftar Hitam', description: 'd', datePublished: '2026-10-09', locale: 'id' });
    expect(a).toMatchObject({ '@type': 'Article', headline: 'Bukan Daftar Hitam', datePublished: '2026-10-09', inLanguage: 'id' });
    expect(a.author).toEqual({ '@type': 'Person', name: SITE.author });
  });
});

describe('pages pass the structured data to the layout', () => {
  it('claim, pakar and manifesto pages call their builders and hand jsonLd to BaseLayout', () => {
    const claim = read('src/pages/klaim/[slug].astro');
    const pakar = read('src/pages/pakar/[slug].astro');
    const manifesto = read('src/pages/manifesto.astro');
    expect(claim).toContain('claimReviewLd(');
    expect(claim).toMatch(/jsonLd=\{/);
    expect(pakar).toContain('personLd(');
    expect(pakar).toMatch(/jsonLd=\{/);
    expect(manifesto).toContain('articleLd(');
    expect(manifesto).toMatch(/jsonLd=\{/);
  });
});

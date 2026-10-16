import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AUTHOR, SAME_AS, SITE } from '../src/lib/site';
import { TIKTOK_AUTHOR } from '../src/lib/tiktok';
import {
  ORGANIZATION_ID, articleHeadline, articleLd, authorLd, claimReviewLd, evidenceImageLd, itemListLd, organizationLd, pageLd,
  postAuthorLd, profilePageLd, speakablePageLd, tiktokUploadDate, videoLd,
} from '../src/lib/schema-org';

const read = (p: string) => readFileSync(p, 'utf8');
const claim = (locale: 'id' | 'en') => claimReviewLd({
  url: `${SITE.url}/klaim/x`, claim: 'Klaim', pakarName: 'Pakar', verdictLabel: 'Sebagian', limits: 'Batas', datePublished: '2026-10-01', locale,
});

// Every helper's output, in both languages, for the whole-tree checks below.
const all = (['id', 'en'] as const).flatMap((locale) => [
  organizationLd(locale), authorLd(locale), claim(locale),
  articleLd({ url: 'u', headline: 'h', description: 'd', datePublished: '2026-10-09', locale }),
  profilePageLd({ url: `${SITE.url}/pakar/x`, name: 'n', field: 'f', description: 'd', locale }),
  pageLd({ name: 'n', path: '/klaim', locale, description: 'd' }),
  speakablePageLd({ url: `${SITE.url}/klaim/x`, name: 'n', locale }),
  itemListLd({ name: 'n', path: '/klaim', items: [{ name: 'a', path: '/klaim/a' }] }),
  videoLd({ name: 'v', thumbnail: '/img/v.jpg', uploadDate: '2026-08-17', embedUrl: 'https://e.example/1', url: 'https://w.example/1' })!,
  evidenceImageLd({ src: '/img/a.png', caption: 'c', pageUrl: `${SITE.url}/b#a`, source: 'LinkedIn', siteAuthored: false }),
  evidenceImageLd({ src: '/img/a.png', caption: 'c', pageUrl: `${SITE.url}/b#a`, siteAuthored: false }),
  evidenceImageLd({ src: '/img/a.png', caption: 'c', pageUrl: `${SITE.url}/b#a`, siteAuthored: true }),
]);

/** Every object in a JSON-LD tree whose key in its parent is `key`. */
function under(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => under(n, key, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(...(Array.isArray(v) ? v : [v]));
      under(v, key, out);
    }
  }
  return out;
}

describe('one publisher, one author', () => {
  it('every publisher (and the ClaimReview author) is the Kawal Kepakaran Organization with the same @id', () => {
    const pubs = all.flatMap((ld) => under(ld, 'publisher')) as Record<string, unknown>[];
    expect(pubs.length).toBeGreaterThan(5);
    for (const p of pubs) expect(p).toMatchObject({ '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE.name });
    expect(claim('id').author['@id']).toBe(ORGANIZATION_ID);
    expect(ORGANIZATION_ID).toBe(`${SITE.url}/#organization`);
  });
  it('names Infraloka only as the parent organisation', () => {
    const o = organizationLd('id');
    expect(o.parentOrganization['@id']).toBe('https://www.infraloka.co.id/#organization');
    expect(o['@id']).not.toContain('infraloka');
  });
  it('links the policies in the page language, corrections at the log anchor', () => {
    expect(organizationLd('id')).toMatchObject({
      publishingPrinciples: `${SITE.url}/metode`, ethicsPolicy: `${SITE.url}/kebijakan`,
      correctionsPolicy: `${SITE.url}/kebijakan#catatan-koreksi`, actionableFeedbackPolicy: `${SITE.url}/hak-jawab`,
    });
    expect(organizationLd('en')).toMatchObject({
      publishingPrinciples: `${SITE.url}/en/method`, ethicsPolicy: `${SITE.url}/en/policy`,
      correctionsPolicy: `${SITE.url}/en/policy#corrections-log`, actionableFeedbackPolicy: `${SITE.url}/en/right-of-reply`,
    });
  });
  it('the anchors the corrections policy points at exist on the policy page', () => {
    const page = read('src/pages/kebijakan.astro');
    expect(page).toContain('id="catatan-koreksi"');
    expect(page).toContain('id="corrections-log"');
  });
  it('Article.author is the site Person with its @id', () => {
    const a = articleLd({ url: 'u', headline: 'h', description: 'd', datePublished: '2026-10-09', locale: 'en' });
    expect(a.author).toMatchObject({ '@type': 'Person', '@id': `${SITE.url}/tentang#person`, name: SITE.author, url: `${SITE.url}/en/about` });
    expect(postAuthorLd(SITE.author, 'id')['@id' as never]).toBe(AUTHOR['@id']);
    expect(postAuthorLd('Someone Else', 'id')).toEqual({ '@type': 'Person', name: 'Someone Else' });
  });
  it('sameAs lists only URLs already linked elsewhere in the repository', () => {
    expect(SAME_AS.author).toContain(`https://www.tiktok.com/@${TIKTOK_AUTHOR}`);
    expect(SAME_AS.organization).toContain(SITE.repo);
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|astro|md|json)$/.test(n) && !p.endsWith(join('lib', 'site.ts')) ? [p] : [];
    });
    // The TikTok profile is built from TIKTOK_AUTHOR in src/lib/tiktok.ts (watchUrl), so the built form counts.
    const corpus = [...files('src'), 'package.json', 'scripts/fetch-tiktok.mjs'].map(read).join('\n') + `\nhttps://www.tiktok.com/@${TIKTOK_AUTHOR}`;
    for (const u of [...SAME_AS.author, ...SAME_AS.organization]) {
      expect(corpus.includes(u) || corpus.includes(u.replace(/\/$/, '')), u).toBe(true);
    }
  });
});

describe('ClaimReview required fields', () => {
  it('has claimReviewed, reviewRating.alternateName, itemReviewed.author.name, url and author', () => {
    for (const ld of [claim('id'), claim('en')]) {
      expect(ld.claimReviewed).toBeTruthy();
      expect(ld.reviewRating.alternateName).toBeTruthy();
      expect(ld.itemReviewed.author.name).toBeTruthy();
      expect(ld.url).toMatch(/^https:\/\//);
      expect(ld.author).toMatchObject({ '@type': 'Organization', name: SITE.name });
    }
  });
});

describe('no undefined values', () => {
  it('no helper emits undefined or null anywhere in its tree', () => {
    const bad: string[] = [];
    const walk = (n: unknown, at: string) => {
      if (n === undefined || n === null) bad.push(at);
      else if (Array.isArray(n)) n.forEach((x, i) => walk(x, `${at}[${i}]`));
      else if (typeof n === 'object') for (const [k, v] of Object.entries(n)) walk(v, `${at}.${k}`);
    };
    all.forEach((ld, i) => walk(ld, `#${i}`));
    expect(bad).toEqual([]);
  });
});

describe('headline, video and image helpers', () => {
  it('drops the translated "(English Edition)" marker on the Indonesian headline only', () => {
    expect(articleHeadline('Mengapa X Disebut (Edisi Bahasa Inggris)', 'id')).toBe('Mengapa X Disebut');
    expect(articleHeadline('Why X Is Named (English Edition)', 'en')).toBe('Why X Is Named (English Edition)');
  });
  it('skips a video missing a required value instead of inventing it', () => {
    expect(videoLd({ name: 'v', thumbnail: '/img/v.jpg', embedUrl: 'e', url: 'u' })).toBeUndefined();
    expect(videoLd({ name: 'v', thumbnail: '/img/v.jpg', uploadDate: '2026-08-17', embedUrl: 'e', url: 'u' })!.thumbnailUrl).toBe(`${SITE.url}/img/v.jpg`);
  });
  it('reads a TikTok upload time from the id', () => {
    expect(tiktokUploadDate('7675283070907485448')).toBe('2026-08-18T08:18:17Z');
    expect(tiktokUploadDate('12')).toBeUndefined();
  });
  it('never claims CC BY for a third-party screenshot', () => {
    const third = evidenceImageLd({ src: '/img/a.png', caption: 'c', pageUrl: 'u', source: 'LinkedIn', siteAuthored: false });
    expect(third).toMatchObject({ creditText: 'LinkedIn' });
    expect(third).not.toHaveProperty('license');
    expect(third).not.toHaveProperty('copyrightNotice');
    expect(third).not.toHaveProperty('acquireLicensePage');
  });
  it('the claim page marks its verdict and limits with the speakable classes', () => {
    const page = read('src/pages/klaim/[slug].astro');
    for (const sel of speakablePageLd({ url: 'u', name: 'n', locale: 'id' }).speakable.cssSelector) expect(page).toContain(`class="${sel.slice(1)}"`);
  });
});

describe('pages hand the shared entities to the layout', () => {
  it('no page builds its own publisher or author object', () => {
    for (const p of ['src/pages/index.astro', 'src/pages/kasus/abil-sudarman/artikel/[slug].astro', 'src/pages/kasus/abil-sudarman/linimasa/[slug].astro']) {
      const s = read(p);
      expect(s, p).not.toMatch(/publisher: \{ '@type'/);
      expect(s, p).not.toMatch(/author: \{ '@type'/);
    }
  });
  it('the hubs list curated entries only', () => {
    for (const p of ['src/pages/klaim/index.astro', 'src/pages/pakar/index.astro']) {
      const s = read(p);
      expect(s, p).toContain('itemListLd(');
      expect(s, p).toMatch(/items: (claims|pakar)\.map/);
    }
  });
});

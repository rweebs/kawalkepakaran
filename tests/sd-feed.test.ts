import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRss, claimFeedItem, claimFeedSummary, revisionGuid } from '../src/lib/feed';

const site = { url: 'https://example.org', name: 'S', description: 'd' };
const claim = {
  id: 'x', path: '/klaim/x', pakarName: 'Abil', claim: 'Klaim <a>', verdict: 'sebagian' as const, evidenceCount: 2,
  replyStatus: 'belum-ada' as const, limits: 'Batas.', date: new Date('2026-10-01T00:00:00Z'), reviewedAt: new Date('2026-10-01T00:00:00Z'),
  image: { src: '/og/klaim/x-id.jpg', width: 1200, height: 630, type: 'image/jpeg' },
};

describe('claim feed items', () => {
  it('titles the item with pakar, verdict and claim', () => {
    expect(claimFeedItem(claim, 'id', site.url).title).toBe('Abil: Sebagian — Klaim <a>');
    expect(claimFeedItem({ ...claim, claim: 'C' }, 'en', site.url).title).toBe('Abil: Partly — C');
  });
  it('summarises with the finding when given, otherwise a derived sentence, then the limits', () => {
    expect(claimFeedSummary({ ...claim, finding: 'Temuan.' }, 'id')).toBe('Temuan. Batas.');
    expect(claimFeedSummary(claim, 'id')).toBe('Sebagian. 2 bukti ditautkan. Belum ada tanggapan. Batas.');
    expect(claimFeedSummary({ ...claim, evidenceCount: 1 }, 'en')).toBe('Partly. 1 evidence item linked. No reply yet. Batas.');
  });
  it('changes the guid when the claim is re-reviewed or a reply arrives', () => {
    const a = claimFeedItem(claim, 'id', site.url).guid;
    const b = claimFeedItem({ ...claim, reviewedAt: new Date('2026-10-05T00:00:00Z') }, 'id', site.url).guid;
    const c = claimFeedItem({ ...claim, replyReceivedAt: new Date('2026-10-07T00:00:00Z') }, 'id', site.url).guid;
    expect(a).toBe('https://example.org/klaim/x#r-2026-10-01');
    expect(b).toBe('https://example.org/klaim/x#r-2026-10-05');
    expect(c).toBe('https://example.org/klaim/x#r-2026-10-07');
    expect(revisionGuid('https://e.org/a', [])).toBe('https://e.org/a');
  });
});

describe('buildRss extras', () => {
  const xml = buildRss([
    claimFeedItem({ ...claim, replyReceivedAt: new Date('2026-10-08T00:00:00Z') }, 'id', site.url),
    { title: 'Post', path: '/p', date: new Date('2026-09-01T00:00:00Z'), summary: 's' },
  ], site);
  it('declares the media namespace and attaches the card with its size and type', () => {
    expect(xml).toContain('xmlns:media="http://search.yahoo.com/mrss/"');
    expect(xml).toContain('<media:content url="https://example.org/og/klaim/x-id.jpg" medium="image" type="image/jpeg" width="1200" height="630"/>');
  });
  it('marks revision guids as non-permalinks and keeps permalinks for plain items', () => {
    expect(xml).toContain('<guid isPermaLink="false">https://example.org/klaim/x#r-2026-10-08</guid>');
    expect(xml).toContain('<guid isPermaLink="true">https://example.org/p</guid>');
  });
  it('lists categories, escaped', () => {
    expect(xml).toContain('<category>Cek klaim</category><category>Sebagian</category><category>Abil</category>');
    expect(xml).toContain('Klaim &lt;a&gt;');
  });
  it('sets lastBuildDate to the latest change, deterministically', () => {
    expect(xml).toContain(`<lastBuildDate>${new Date('2026-10-08T00:00:00Z').toUTCString()}</lastBuildDate>`);
    expect(buildRss([], site)).not.toContain('lastBuildDate');
  });
});

describe('feed routes', () => {
  for (const f of ['src/pages/rss.xml.ts', 'src/pages/en/rss.xml.ts']) {
    it(`${f} skips generated claims and uses the claim helper and OG cards`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toContain('!isGenerated(k)');
      expect(src).toContain('claimFeedItem(');
      expect(src).toContain('claimOg(');
      expect(src).toContain('articleOg(');
    });
  }
});

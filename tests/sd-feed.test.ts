import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildRss, claimFeedItem, claimFeedSummary, CONTENT_MAX, revisionGuid, WEBSUB_HUB } from '../src/lib/feed';

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

describe('content:encoded and WebSub', () => {
  const long = 'kata '.repeat(200);
  const xml = buildRss([
    claimFeedItem(claim, 'en', site.url),
    { title: 'Post', path: '/p', date: new Date('2026-09-01T00:00:00Z'), summary: 's', content: long },
    { title: 'Bare', path: '/b', date: new Date('2026-08-01T00:00:00Z'), summary: 's' },
    { title: 'Evil', path: '/e', date: new Date('2026-07-01T00:00:00Z'), summary: 's', content: 'a ]]> <b>x</b> & y' },
  ], site);
  it('declares the content namespace and announces the WebSub hub', () => {
    expect(xml).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
    expect(xml).toContain(`<atom:link rel="hub" href="${WEBSUB_HUB}"/>`);
    expect(WEBSUB_HUB).toBe('https://pubsubhubbub.appspot.com/');
  });
  it("gives a claim its 'what this does not prove' text", () => {
    expect(claimFeedItem(claim, 'id', site.url).content).toBe('Yang tidak dibuktikan: Batas.');
    expect(xml).toContain('<content:encoded><![CDATA[<p>What this does not prove: Batas.</p>]]></content:encoded>');
  });
  it('cuts the excerpt to about 300 characters and leaves it out when there is none', () => {
    const body = xml.match(/<title>Post<\/title>[\s\S]*?<content:encoded><!\[CDATA\[<p>([^<]*)<\/p>/)![1];
    expect(body.length).toBeLessThanOrEqual(CONTENT_MAX);
    expect(body.endsWith('…')).toBe(true);
    expect(xml.match(/<title>Bare<\/title>[^\n]*/)![0]).not.toContain('content:encoded');
  });
  it('escapes the excerpt so it cannot close the CDATA section or inject markup', () => {
    expect(xml).toContain('<![CDATA[<p>a ]]&gt; &lt;b&gt;x&lt;/b&gt; &amp; y</p>]]>');
  });
});

describe('feed parity', () => {
  it('both feeds carry the same hand-made claim checks and article excerpts', () => {
    const strip = (f: string) => readFileSync(f, 'utf8');
    for (const f of ['src/pages/rss.xml.ts', 'src/pages/en/rss.xml.ts']) {
      const src = strip(f);
      expect(src, f).toContain('(await getKlaim()).filter((k) => !isGenerated(k))');
      expect(src, f).toContain('reviewedAt: k.data.reviewedAt');
      expect(src, f).toContain('replyReceivedAt: k.data.reply?.receivedAt');
      expect(src, f).toContain('content: descriptionFromMarkdown(p.body ?? \'\', CONTENT_MAX)');
    }
  });
});

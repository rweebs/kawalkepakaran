import { describe, it, expect } from 'vitest';
import { buildRss } from '../src/lib/feed';

const site = { url: 'https://example.org', name: 'Site & Co', description: 'd' };
describe('buildRss', () => {
  it('orders newest first, escapes text and uses absolute links', () => {
    const xml = buildRss([
      { title: 'Old <one>', path: '/a', date: new Date('2026-01-01T00:00:00Z'), summary: 'x & y' },
      { title: 'New', path: '/b', date: new Date('2026-02-01T00:00:00Z'), summary: 's' },
    ], site);
    expect(xml.indexOf('New')).toBeLessThan(xml.indexOf('Old'));
    expect(xml).toContain('Old &lt;one&gt;');
    expect(xml).toContain('<title>Site &amp; Co</title>');
    expect(xml).toContain('<link>https://example.org/b</link>');
    expect(xml).toContain('rel="self"');
  });
  it('is well-formed with no items', () => {
    expect(buildRss([], site)).toContain('</channel>');
  });
});

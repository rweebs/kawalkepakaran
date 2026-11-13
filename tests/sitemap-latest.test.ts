import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { latestSitemapInfo, SITEMAP_LATEST } from '../src/lib/sitemap-latest';
import type { WatchStore } from '../src/lib/sitemap-watch';

const url = (lastmod: string | null) => ({ firstSeen: '2026-11-13', lastSeen: '2026-11-13', lastmod, images: 0 });
const snap = (date: string) => ({ date, total: 1, images: 0, sections: {} });

describe('latestSitemapInfo', () => {
  it('takes the newest lastmod as a Jakarta day, whatever the offset', () => {
    const s: WatchStore = { source: 'x', snapshots: [snap('2026-11-13')], urls: { '/a/': url('2026-11-12T20:33:49+07:00'), '/b/': url('2026-11-12T18:00:00+00:00'), '/c/': url('2026-07-19T18:08:02+08:00') } };
    // 18:00 UTC on the 12th is already 01:00 on the 13th in Jakarta.
    expect(latestSitemapInfo(s)).toEqual({ lastmod: '2026-11-13', checked: '2026-11-13' });
  });
  it('uses the newest snapshot and ignores URLs without a lastmod', () => {
    const s: WatchStore = { source: 'x', snapshots: [snap('2026-11-01'), snap('2026-11-13'), snap('2026-11-05')], urls: { '/a/': url(null), '/b/': url('2026-10-01') } };
    expect(latestSitemapInfo(s)).toEqual({ lastmod: '2026-10-01', checked: '2026-11-13' });
  });
  it('is empty when there is nothing to read', () => {
    expect(latestSitemapInfo({ source: 'x', snapshots: [], urls: {} })).toEqual({ lastmod: null, checked: null });
  });
  it('reads the stored sitemap watch', () => {
    expect(SITEMAP_LATEST.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SITEMAP_LATEST.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('is shown in the footer of the shared layout', () => {
    const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
    expect(layout).toContain('SITEMAP_LATEST');
    expect(layout).toContain('footer__info');
  });
});

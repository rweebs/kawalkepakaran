import type { APIRoute } from 'astro';
import { getPostsEn } from '../../lib/content';
import { getKlaim, isGenerated } from '../../lib/pakar';
import { buildRss, type FeedItem } from '../../lib/feed';
import { descriptionFromMarkdown } from '../../lib/seo';
import { SITE } from '../../lib/site';
import { UI } from '../../i18n/ui';

/** English feed: the English posts and the claim checks with their English text. */
export const GET: APIRoute = async () => {
  const posts = await getPostsEn();
  const klaim = (await getKlaim()).filter((k) => !isGenerated(k));
  const items: FeedItem[] = [
    ...posts.map((p) => ({
      title: p.data.title,
      path: `/en/cases/abil-sudarman/articles/${p.id}`,
      date: p.data.publishedDate,
      summary: descriptionFromMarkdown(p.body ?? '') || p.data.title,
    })),
    ...klaim.map((k) => ({
      title: k.data.claimEn,
      path: `/en/claims/${k.id}`,
      date: k.data.reviewedAt ?? k.data.madeAt ?? new Date('2026-10-09T00:00:00Z'),
      summary: k.data.limitsEn,
    })),
  ];
  return new Response(buildRss(items, { ...SITE, description: UI.en.siteDescription }, '/en/rss.xml', 'en'), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};

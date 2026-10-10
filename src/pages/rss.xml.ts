import type { APIRoute } from 'astro';
import { getPosts } from '../lib/content';
import { getKlaim, isGenerated } from '../lib/pakar';
import { buildRss, type FeedItem } from '../lib/feed';
import { descriptionFromMarkdown } from '../lib/seo';
import { SITE } from '../lib/site';

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const klaim = (await getKlaim()).filter((k) => !isGenerated(k));
  const items: FeedItem[] = [
    ...posts.map((p) => ({
      title: p.data.title,
      path: `/kasus/abil-sudarman/artikel/${p.id}`,
      date: p.data.translationDate,
      summary: descriptionFromMarkdown(p.body ?? '') || p.data.title,
    })),
    ...klaim.map((k) => ({
      title: k.data.claim,
      path: `/klaim/${k.id}`,
      date: k.data.madeAt ?? new Date('2026-10-09T00:00:00Z'),
      summary: k.data.limits,
    })),
  ];
  return new Response(buildRss(items, SITE), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};

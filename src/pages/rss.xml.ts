import type { APIRoute } from 'astro';
import { getPosts } from '../lib/content';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { buildRss, claimFeedItem, CONTENT_MAX, type FeedItem } from '../lib/feed';
import { articleOg, claimOg } from '../lib/og';
import { descriptionFromMarkdown } from '../lib/seo';
import { SITE } from '../lib/site';
import { verdictLabel } from '../lib/verdict';

const FALLBACK_DATE = new Date('2026-10-09T00:00:00Z');

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  // Claims generated from the archive are not checks the site published, so they stay out of the feed.
  const klaim = (await getKlaim()).filter((k) => !isGenerated(k));
  const pakarName = new Map((await getPakar()).map((p) => [p.id, p.data.name]));
  const items: FeedItem[] = [
    ...posts.map((p) => ({
      title: p.data.title,
      path: `/kasus/abil-sudarman/artikel/${p.id}`,
      date: p.data.translationDate,
      summary: descriptionFromMarkdown(p.body ?? '') || p.data.title,
      // The opening paragraph, longer than the description; buildRss cuts it to CONTENT_MAX.
      content: descriptionFromMarkdown(p.body ?? '', CONTENT_MAX) || undefined,
      image: articleOg(p.id, 'id', p.data.title),
      categories: ['Kasus Abil Sudarman'],
    })),
    ...klaim.map((k) => claimFeedItem({
      id: k.id,
      path: `/klaim/${k.id}`,
      pakarName: pakarName.get(k.data.pakar) ?? k.data.pakar,
      claim: k.data.claim,
      verdict: k.data.verdict,
      evidenceCount: k.data.evidence.length,
      replyStatus: k.data.replyStatus,
      limits: k.data.limits,
      finding: k.data.finding,
      date: k.data.reviewedAt ?? k.data.madeAt ?? FALLBACK_DATE,
      reviewedAt: k.data.reviewedAt,
      replyReceivedAt: k.data.reply?.receivedAt,
      image: claimOg(k.id, 'id', k.data.claim, verdictLabel(k.data.verdict, 'id')),
    }, 'id', SITE.url)),
  ];
  return new Response(buildRss(items, SITE), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};

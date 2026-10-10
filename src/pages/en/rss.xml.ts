import type { APIRoute } from 'astro';
import { getPostsEn } from '../../lib/content';
import { getKlaim, getPakar, isGenerated } from '../../lib/pakar';
import { buildRss, claimFeedItem, type FeedItem } from '../../lib/feed';
import { articleOg, claimOg } from '../../lib/og';
import { descriptionFromMarkdown } from '../../lib/seo';
import { SITE } from '../../lib/site';
import { verdictLabel } from '../../lib/verdict';
import { UI } from '../../i18n/ui';

const FALLBACK_DATE = new Date('2026-10-09T00:00:00Z');

/** English feed: the English posts and the claim checks with their English text. */
export const GET: APIRoute = async () => {
  const posts = await getPostsEn();
  // Claims generated from the archive are not checks the site published, so they stay out of the feed.
  const klaim = (await getKlaim()).filter((k) => !isGenerated(k));
  const pakarName = new Map((await getPakar()).map((p) => [p.id, p.data.name]));
  const items: FeedItem[] = [
    ...posts.map((p) => ({
      title: p.data.title,
      path: `/en/cases/abil-sudarman/articles/${p.id}`,
      date: p.data.publishedDate,
      summary: descriptionFromMarkdown(p.body ?? '') || p.data.title,
      image: articleOg(p.id, 'en', p.data.title),
      categories: ['Case: Abil Sudarman'],
    })),
    ...klaim.map((k) => claimFeedItem({
      id: k.id,
      path: `/en/claims/${k.id}`,
      pakarName: pakarName.get(k.data.pakar) ?? k.data.pakar,
      claim: k.data.claimEn,
      verdict: k.data.verdict,
      evidenceCount: k.data.evidence.length,
      replyStatus: k.data.replyStatus,
      limits: k.data.limitsEn,
      finding: k.data.findingEn,
      date: k.data.reviewedAt ?? k.data.madeAt ?? FALLBACK_DATE,
      reviewedAt: k.data.reviewedAt,
      replyReceivedAt: k.data.reply?.receivedAt,
      image: claimOg(k.id, 'en', k.data.claimEn, verdictLabel(k.data.verdict, 'en')),
    }, 'en', SITE.url)),
  ];
  return new Response(buildRss(items, { ...SITE, description: UI.en.siteDescription }, '/en/rss.xml', 'en'), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};

import { getPakar, isGenerated, klaimForPakar } from './pakar';
import { buildRss } from './feed';
import { pakarFeedChannel, pakarFeedItems, pakarFeedPath } from './pakar-feed';
import { SITE } from './site';
import type { Locale } from '../i18n';

const FALLBACK_DATE = new Date('2026-10-09T00:00:00Z');

/** Hand-made experts only: generated (archive) profiles are noindex and get no feed. */
export async function curatedPakarPaths() {
  return (await getPakar()).filter((p) => !isGenerated(p)).map((p) => ({ params: { slug: p.id } }));
}

/** One expert's RSS feed in the given language (src/pages/pakar/[slug]/rss.xml.ts and its /en twin). */
export async function pakarFeedResponse(id: string, locale: Locale): Promise<Response> {
  const pakar = (await getPakar()).find((p) => p.id === id)!;
  // Claims generated from the archive are not checks the site published, so they stay out of the feed.
  const claims = (await klaimForPakar(id)).filter((k) => !isGenerated(k)).map((k) => ({ id: k.id, ...k.data }));
  const items = pakarFeedItems(pakar.data.name, claims, locale, SITE.url, FALLBACK_DATE);
  const xml = buildRss(items, { url: SITE.url, ...pakarFeedChannel(pakar.data.name, locale) }, pakarFeedPath(id, locale), locale);
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}

import type { Locale } from '../i18n';
import type { Verdict } from './schemas';
import { replyStatusLabel, verdictLabel } from './verdict';

/** A media card attached to an item (the OG card): src is a site path or an absolute URL. */
export interface FeedImage { src: string; width: number; height: number; type: string }

export interface FeedItem {
  title: string;
  path: string;
  date: Date;
  summary: string;
  /** Overrides the permalink guid (then emitted with isPermaLink="false"); see revisionGuid. */
  guid?: string;
  /** Latest change to the item (review or reply); feeds into the channel lastBuildDate. Defaults to date. */
  updated?: Date;
  image?: FeedImage;
  categories?: readonly string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * A guid that changes when the item is revised: the permalink plus '#r-' and the latest of the given dates.
 * A new review or a received reply then reaches feed readers as a new item.
 */
export function revisionGuid(url: string, dates: readonly (Date | undefined)[]): string {
  const times = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime())).map((d) => d.getTime());
  return times.length ? `${url}#r-${day(new Date(Math.max(...times)))}` : url;
}

export interface ClaimFeedInput {
  id: string;
  path: string;
  pakarName: string;
  claim: string;
  verdict: Verdict;
  evidenceCount: number;
  replyStatus: 'belum-ada' | 'diterima' | 'dipublikasikan';
  limits: string;
  finding?: string;
  date: Date;
  reviewedAt?: Date;
  replyReceivedAt?: Date;
  image?: FeedImage;
}

const EVIDENCE: Record<Locale, (n: number) => string> = {
  id: (n) => (n === 0 ? 'Belum ada bukti yang ditautkan' : `${n} bukti ditautkan`),
  en: (n) => (n === 0 ? 'No evidence linked yet' : `${n} evidence item${n === 1 ? '' : 's'} linked`),
};
const CLAIMS_CATEGORY: Record<Locale, string> = { id: 'Cek klaim', en: 'Claim checks' };

/** The finding, or a sentence built from the verdict, the evidence count and the reply status; then the limits. */
export function claimFeedSummary(i: Pick<ClaimFeedInput, 'verdict' | 'evidenceCount' | 'replyStatus' | 'limits' | 'finding'>, locale: Locale): string {
  const finding = i.finding?.trim()
    || `${verdictLabel(i.verdict, locale)}. ${EVIDENCE[locale](i.evidenceCount)}. ${replyStatusLabel(i.replyStatus, locale)}.`;
  return `${finding} ${i.limits}`.trim();
}

/** A claim check as a feed item: titled "<pakar>: <verdict> — <claim>", with a guid that moves on each review or reply. */
export function claimFeedItem(i: ClaimFeedInput, locale: Locale, siteUrl: string): FeedItem {
  const label = verdictLabel(i.verdict, locale);
  const url = new URL(i.path, siteUrl).toString();
  const updated = [i.date, i.reviewedAt, i.replyReceivedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    title: `${i.pakarName}: ${label} — ${i.claim}`,
    path: i.path,
    date: i.date,
    updated,
    summary: claimFeedSummary(i, locale),
    guid: revisionGuid(url, [i.reviewedAt, i.replyReceivedAt]),
    ...(i.image ? { image: i.image } : {}),
    categories: [CLAIMS_CATEGORY[locale], label, i.pakarName],
  };
}

/** RSS 2.0 feed, newest item first. lastBuildDate is the latest item change, so an unchanged feed rebuilds byte-identical. */
export function buildRss(items: FeedItem[], site: { url: string; name: string; description: string }, feedPath = '/rss.xml', language = 'id'): string {
  const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
  const abs = (p: string) => new URL(p, site.url).toString();
  const body = sorted.map((i) => {
    const link = abs(i.path);
    const guid = i.guid && i.guid !== link
      ? `<guid isPermaLink="false">${esc(i.guid)}</guid>`
      : `<guid isPermaLink="true">${esc(link)}</guid>`;
    const categories = (i.categories ?? []).map((c) => `<category>${esc(c)}</category>`).join('');
    const media = i.image
      ? `<media:content url="${esc(abs(i.image.src))}" medium="image" type="${esc(i.image.type)}" width="${i.image.width}" height="${i.image.height}"/>`
      : '';
    return `    <item><title>${esc(i.title)}</title><link>${esc(link)}</link>${guid}<pubDate>${i.date.toUTCString()}</pubDate>${categories}<description>${esc(i.summary)}</description>${media}</item>`;
  });
  const times = items.map((i) => Math.max(i.date.getTime(), i.updated?.getTime() ?? 0));
  const lastBuild = times.length ? `    <lastBuildDate>${new Date(Math.max(...times)).toUTCString()}</lastBuildDate>` : undefined;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    `    <title>${esc(site.name)}</title>`,
    `    <link>${esc(site.url)}</link>`,
    `    <description>${esc(site.description)}</description>`,
    `    <language>${language}</language>`,
    ...(lastBuild ? [lastBuild] : []),
    `    <atom:link href="${esc(abs(feedPath))}" rel="self" type="application/rss+xml"/>`,
    ...body,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

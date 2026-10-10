export interface FeedItem { title: string; path: string; date: Date; summary: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RSS 2.0 feed, newest item first. */
export function buildRss(items: FeedItem[], site: { url: string; name: string; description: string }, feedPath = '/rss.xml'): string {
  const sorted = [...items].sort((a, b) => b.date.getTime() - a.date.getTime());
  const abs = (p: string) => new URL(p, site.url).toString();
  const body = sorted.map((i) =>
    `    <item><title>${esc(i.title)}</title><link>${esc(abs(i.path))}</link><guid isPermaLink="true">${esc(abs(i.path))}</guid><pubDate>${i.date.toUTCString()}</pubDate><description>${esc(i.summary)}</description></item>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${esc(site.name)}</title>`,
    `    <link>${esc(site.url)}</link>`,
    `    <description>${esc(site.description)}</description>`,
    '    <language>id</language>',
    `    <atom:link href="${esc(abs(feedPath))}" rel="self" type="application/rss+xml"/>`,
    ...body,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

export function truncateAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const i = cut.lastIndexOf(' ');
  const base = i > max * 0.5 ? cut.slice(0, i) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

/** Longest <title> the site allows, counted as written in the HTML (the dist check measures the escaped text). */
export const TITLE_MAX = 65;

/** Length of the text once escaped in HTML: & becomes &amp;, ' becomes &#39;, " becomes &quot;, < and > become &lt; / &gt;. */
export function htmlLength(s: string): number {
  let n = s.length;
  for (const ch of s) n += ch === '&' ? 4 : ch === "'" ? 4 : ch === '"' ? 5 : ch === '<' || ch === '>' ? 3 : 0;
  return n;
}

/** Page title with the brand suffix. Every title, cut or not, ends in the same full brand (" · Kawal Kepakaran"); a long title
 *  is cut at a word so the whole stays within `max` as escaped HTML. A trailing " #n" (the number that tells colliding titles
 *  apart) survives the cut. */
export function buildTitle(title: string, brand: string, max = TITLE_MAX): string {
  if (title === brand) return brand;
  const suffix = ` · ${brand}`;
  const long = `${title}${suffix}`;
  if (htmlLength(long) <= max) return long;
  const [, head, num = ''] = /^(.*?)( #\d+)?$/s.exec(title.trim())!;
  let budget = max - suffix.length - num.length;
  let cut = truncateAtWord(head, budget);
  while (htmlLength(cut + num + suffix) > max && budget > 10) cut = truncateAtWord(head, --budget);
  return cut + num + suffix;
}

/** Titles for a set of pages that share a template, numbered (" #1", " #2") where two would otherwise produce the same
 *  <title> once cut, the same convention the archive uses. Returns id -> the title to hand to the layout. */
export function distinctTitles(items: ReadonlyArray<{ id: string; title: string }>, brand: string, max = TITLE_MAX): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, string[]>();
  for (const it of sorted) {
    const k = buildTitle(it.title, brand, max);
    groups.set(k, [...(groups.get(k) ?? []), it.id]);
  }
  const out = new Map<string, string>();
  for (const it of sorted) {
    const same = groups.get(buildTitle(it.title, brand, max))!;
    out.set(it.id, same.length > 1 ? `${it.title} #${same.indexOf(it.id) + 1}` : it.title);
  }
  return out;
}

/** Meta descriptions for a set of pages, where two pages that would share one get their own title in front, so each is unique. */
export function distinctDescriptions(items: ReadonlyArray<{ id: string; title: string; description: string }>, max = 160): Map<string, string> {
  const count = new Map<string, number>();
  for (const it of items) count.set(it.description, (count.get(it.description) ?? 0) + 1);
  return new Map(items.map((it) => [it.id, (count.get(it.description) ?? 0) > 1 ? truncateAtWord(`${it.title}. ${it.description}`, max) : it.description]));
}

function stripMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function descriptionFromMarkdown(md: string, max = 155, min = 70): string {
  const body = md.replace(/^---[\s\S]*?---/, '');
  for (const block of body.split(/\n\s*\n/)) {
    if (/^\s*#{1,6}\s/.test(block)) continue;
    const text = stripMarkdown(block);
    if (text.length >= min) return truncateAtWord(text, max);
  }
  return '';
}

export function breadcrumbLd(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

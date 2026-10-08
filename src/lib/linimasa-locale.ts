// Locale-aware view of the timeline: Indonesian is the source of truth (src/lib/linimasa.ts), English comes from linimasa-en.ts.
import { EVENTS, type TimelineEvent, type TimelineLink, type TimelineRelated } from './linimasa';
import { CHANNEL_EN, EVENTS_EN } from './linimasa-en';
import { localizeHref } from '../i18n/ui';
import { formatDateLocale, localizedPath, type Locale } from '../i18n';

export interface LocalizedEvent {
  /** Slug in the Indonesian source data (pairs the two languages). */
  idSlug: string;
  /** Slug in the URL for this language. */
  slug: string;
  date: string;
  title: string;
  channel: string;
  paragraphs: string[];
  sources: TimelineLink[];
  related: TimelineRelated[];
}

/** Article URL in the given language: '/kasus/abil-sudarman/artikel/x' -> '/en/cases/abil-sudarman/articles/x'. Other local links go through the route table. */
export function localizeLocalHref(href: string, locale: Locale): string {
  if (locale === 'id') return href;
  if (href.startsWith('/kasus/abil-sudarman/artikel/')) return localizedPath('articles', 'en', href.slice('/kasus/abil-sudarman/artikel/'.length));
  return localizeHref(href, 'en');
}

export function localizeEvent(e: TimelineEvent, locale: Locale): LocalizedEvent {
  if (locale === 'id') return { idSlug: e.slug, ...e };
  const en = EVENTS_EN[e.slug];
  if (!en) throw new Error(`No English timeline entry for "${e.slug}"`);
  return {
    idSlug: e.slug,
    slug: en.slug,
    date: e.date,
    title: en.title,
    channel: CHANNEL_EN[e.channel] ?? e.channel,
    paragraphs: en.paragraphs,
    sources: e.sources.map((s, i) => ({ url: s.url, label: en.src[i] ?? s.label })),
    related: e.related.map((r, i) => ({ href: localizeLocalHref(r.href, 'en'), label: en.rel[i] ?? r.label })),
  };
}

export const localizedEvents = (locale: Locale): LocalizedEvent[] => EVENTS.map((e) => localizeEvent(e, locale));

export const eventPath = (e: LocalizedEvent, locale: Locale) => localizedPath('timeline', locale, e.slug);

export const formatDateFor = (iso: string, locale: Locale) => formatDateLocale(iso, locale);

export function monthLabelFor(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
}

/** Events are stored oldest first; groups keep that order. */
export function groupByMonthFor(events: LocalizedEvent[], locale: Locale): { label: string; items: LocalizedEvent[] }[] {
  const groups: { label: string; items: LocalizedEvent[] }[] = [];
  for (const e of events) {
    const label = monthLabelFor(e.date, locale);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

export function neighboursFor(events: LocalizedEvent[], idSlug: string): { prev?: LocalizedEvent; next?: LocalizedEvent } {
  const i = events.findIndex((e) => e.idSlug === idSlug);
  return { prev: i > 0 ? events[i - 1] : undefined, next: i >= 0 && i < events.length - 1 ? events[i + 1] : undefined };
}

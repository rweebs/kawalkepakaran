// Two languages: Indonesian lives at the root (existing URLs stay unchanged), English under /en.
export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'id';

export const OG_LOCALE: Record<Locale, string> = { id: 'id_ID', en: 'en_US' };
export const LANGUAGE_NAME: Record<Locale, string> = { id: 'Bahasa Indonesia', en: 'English' };
export const LANGUAGE_SHORT: Record<Locale, string> = { id: 'ID', en: 'EN' };

export const isLocale = (v: unknown): v is Locale => v === 'id' || v === 'en';
export const otherLocale = (l: Locale): Locale => (l === 'id' ? 'en' : 'id');

/** Section of the site, with its URL in each language. */
export const ROUTES = {
  home: { id: '/', en: '/en' },
  articles: { id: '/artikel', en: '/en/articles' },
  evidence: { id: '/bukti', en: '/en/evidence' },
  timeline: { id: '/linimasa', en: '/en/timeline' },
  videos: { id: '/videos', en: '/en/videos' },
  tiktok: { id: '/tiktok', en: '/en/tiktok' },
  books: { id: '/buku', en: '/en/books' },
  about: { id: '/tentang', en: '/en/about' },
  bowobharata: { id: '/bowobharata', en: '/en/bowobharata' },
  pagespeed: { id: '/pagespeed', en: '/en/pagespeed' },
  reply: { id: '/hak-jawab', en: '/en/right-of-reply' },
  disclaimer: { id: '/disclaimer', en: '/en/disclaimer' },
} as const;
export type RouteKey = keyof typeof ROUTES;

export const routePath = (key: RouteKey, locale: Locale): string => ROUTES[key][locale];

/** Locale a URL path belongs to. */
export function pathLocale(path: string): Locale {
  return path === '/en' || path.startsWith('/en/') ? 'en' : 'id';
}

/** The Indonesian path of a page, whichever language the given path is in ('/en/about' -> '/tentang'). */
export function toIndonesianPath(path: string): string {
  for (const r of Object.values(ROUTES)) if (r.en === path) return r.id;
  return path;
}

/** Both language versions of a static page, or undefined when the path is not a paired page. */
export function alternatesForPath(path: string): Record<Locale, string> | undefined {
  for (const r of Object.values(ROUTES)) if (r.id === path || r.en === path) return { id: r.id, en: r.en };
  return undefined;
}

/** Path of a section, optionally with a child segment: localizedPath('articles', 'en', 'my-post'). */
export function localizedPath(key: RouteKey, locale: Locale, child?: string): string {
  const base = ROUTES[key][locale];
  return child ? `${base}/${child}` : base;
}

/** Locale-aware date, e.g. 7 Juni 2026 / June 7, 2026. */
export function formatDateLocale(iso: string | Date, locale: Locale): string {
  const d = typeof iso === 'string' ? new Date(`${iso}T00:00:00Z`) : iso;
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

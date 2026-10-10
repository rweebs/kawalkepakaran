import type { Locale } from '../i18n';

/** A social preview card. Every card is 1200x630 JPEG under 300 KB (WhatsApp drops larger previews). */
export interface OgImage { src: string; alt: string; width: number; height: number; type: string }

// Cards are rendered at build time by scripts/make-og.mjs into public/og/. Each one carries the verdict (where there is one),
// the "notes and opinion, not a ruling" line and the site URL, so a preview seen out of context still says what it is.
const card = (src: string, alt: string): OgImage => ({ src, alt, width: 1200, height: 630, type: 'image/jpeg' });

const SITE_ALT: Record<Locale, string> = {
  id: 'Kawal Kepakaran: menguji klaim para pakar. Catatan dan pendapat penulis, bukan putusan.',
  en: "Kawal Kepakaran: checking what experts claim. The author's notes and opinion, not a ruling.",
};

export const siteOg = (locale: Locale): OgImage => card(`/og/site-${locale}.jpg`, SITE_ALT[locale]);

export const claimOg = (id: string, locale: Locale, claim: string, verdict: string): OgImage =>
  card(`/og/klaim/${id}-${locale}.jpg`, `${verdict}: ${claim}`);

export const pakarOg = (id: string, locale: Locale, name: string): OgImage =>
  card(`/og/pakar/${id}-${locale}.jpg`, locale === 'id' ? `Pakar yang diperiksa: ${name}` : `Expert checked: ${name}`);

export const caseOg = (locale: Locale): OgImage =>
  card(`/og/kasus-001-${locale}.jpg`, locale === 'id' ? 'Kasus 001: Abil Sudarman. Catatan dan pendapat penulis, bukan putusan.' : "Case 001: Abil Sudarman. The author's notes and opinion, not a ruling.");

/** Articles get a text card with their title; the in-page header image is never reused as the preview. */
export const articleOg = (slug: string, locale: Locale, title: string): OgImage => card(`/og/artikel/${slug}-${locale}.jpg`, title);

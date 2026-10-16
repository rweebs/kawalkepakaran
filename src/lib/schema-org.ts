import { AUTHOR, SAME_AS, SITE } from './site';
import { routePath, type Locale } from '../i18n';

export const CONTENT_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

/** A site path (such as an OG card's src) made absolute; absolute URLs pass through. */
const absolute = (u: string) => new URL(u, SITE.url).toString();

/** The one @id every page uses for the publisher. */
export const ORGANIZATION_ID = `${SITE.url}/#organization`;

/** The company behind the site: named as the parent, never as the publisher. */
const PARENT_ORGANIZATION = { '@type': 'Organization', '@id': 'https://www.infraloka.co.id/#organization', name: 'Infraloka', url: 'https://www.infraloka.co.id' } as const;

/** Corrections log anchor on the policy page, per language. */
const CORRECTIONS_ANCHOR: Record<Locale, string> = { id: 'catatan-koreksi', en: 'corrections-log' };

/** Where the publisher states its method, corrections, ethics and reply process, in the page language. */
function policies(locale: Locale) {
  return {
    publishingPrinciples: absolute(routePath('method', locale)),
    correctionsPolicy: absolute(`${routePath('policy', locale)}#${CORRECTIONS_ANCHOR[locale]}`),
    ethicsPolicy: absolute(routePath('policy', locale)),
    actionableFeedbackPolicy: absolute(routePath('reply', locale)),
  };
}

/** The site as a publisher: one stable @id on every page, with its policies in the page language. */
export function organizationLd(locale: Locale = 'id') {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE.name,
    url: SITE.url,
    logo: { '@type': 'ImageObject', url: absolute('/apple-touch-icon.png') },
    ...(SAME_AS.organization.length ? { sameAs: [...SAME_AS.organization] } : {}),
    parentOrganization: { ...PARENT_ORGANIZATION },
    ...policies(locale),
  };
}

/** Kept for older callers: the publisher with its Indonesian policy pages. */
export const publisher = organizationLd('id');

/** The site's author as one Person (@id on the about page); `url` is the about page in the page language. */
export function authorLd(locale: Locale = 'id') {
  return {
    '@type': 'Person',
    '@id': AUTHOR['@id'],
    name: AUTHOR.name,
    url: locale === 'en' ? AUTHOR.urlEn : AUTHOR.url,
    ...(SAME_AS.author.length ? { sameAs: [...SAME_AS.author] } : {}),
  };
}

/** A post's author: the site's Person when it is the founder, else a plain named Person. */
export const postAuthorLd = (name: string, locale: Locale) => (name === AUTHOR.name ? authorLd(locale) : { '@type': 'Person', name });

/**
 * Article headline for a page. A translated post can carry its original's "(English Edition)" marker in translation
 * ("(Edisi Bahasa Inggris)"); on the Indonesian page that would claim the page is the English edition, so it is dropped.
 */
export function articleHeadline(title: string, locale: Locale): string {
  const h = locale === 'id' ? title.replace(/\s*\(Edisi Bahasa Inggris\)\s*$/i, '') : title;
  return h.slice(0, 110);
}

interface ClaimReviewInput {
  url: string;
  claim: string;
  pakarName: string;
  /** Text label of the verdict, in the page language. The verdict scale is not numeric, so no ratingValue is emitted. */
  verdictLabel: string;
  /** "What this does not prove": published as the review body so the limits travel with the verdict. */
  limits: string;
  /** Date the check was first published (YYYY-MM-DD): publishedAt, falling back to reviewedAt. */
  datePublished: string;
  /** Date the check was last reviewed (YYYY-MM-DD): reviewedAt. Defaults to datePublished. */
  dateModified?: string;
  /** URL of the claimant's profile page; links the claim's author to the Person entity. */
  pakarUrl?: string;
  locale: Locale;
  /** Left out of the output when unknown. */
  claimMadeAt?: string;
  /** Where the claim can be seen (klaim.venueUrl); becomes itemReviewed.appearance and firstAppearance. */
  appearanceUrl?: string;
  /** The claim's social card: an absolute URL or a site path (claimOg(...).src), emitted as an absolute URL. */
  image?: string;
  /** Defaults to "<verdict label>: <claim>", cut to 110 characters. */
  headline?: string;
}

/** schema.org ClaimReview for a claim check. Authored by the site, about a claim made by a pakar. */
export function claimReviewLd(i: ClaimReviewInput) {
  const appearance = i.appearanceUrl ? { '@type': 'CreativeWork', url: i.appearanceUrl } : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'ClaimReview',
    url: i.url,
    headline: (i.headline ?? `${i.verdictLabel}: ${i.claim}`).slice(0, 110),
    inLanguage: i.locale,
    datePublished: i.datePublished,
    dateModified: i.dateModified ?? i.datePublished,
    ...(i.image ? { image: absolute(i.image) } : {}),
    license: CONTENT_LICENSE,
    claimReviewed: i.claim,
    reviewBody: i.limits,
    author: organizationLd(i.locale),
    publisher: organizationLd(i.locale),
    itemReviewed: {
      '@type': 'Claim',
      author: { '@type': 'Person', ...(i.pakarUrl ? { '@id': `${i.pakarUrl}#person` } : {}), name: i.pakarName },
      ...(i.claimMadeAt ? { datePublished: i.claimMadeAt } : {}),
      ...(appearance ? { appearance: [appearance], firstAppearance: appearance } : {}),
    },
    reviewRating: { '@type': 'Rating', name: i.verdictLabel, alternateName: i.verdictLabel },
  };
}

/** Class names on a claim page that a voice assistant may read aloud: the verdict block and the limits. */
export const SPEAKABLE_SELECTORS = ['.claim-verdict', '.claim-limits'] as const;

/** The claim page as a WebPage whose verdict and limits are speakable; its main entity is the ClaimReview. */
export function speakablePageLd(i: { url: string; name: string; locale: Locale }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': i.url,
    url: i.url,
    name: i.name,
    inLanguage: i.locale,
    speakable: { '@type': 'SpeakableSpecification', cssSelector: [...SPEAKABLE_SELECTORS] },
    publisher: organizationLd(i.locale),
  };
}

interface PersonInput {
  url: string;
  name: string;
  field: string;
  description: string;
  /** Not emitted on the Person (a person has no language); used by profilePageLd. Kept for older callers. */
  locale?: Locale;
  /** Credential source URLs (pakar.data.credentials.map((c) => c.source)); empty values dropped, duplicates removed. */
  sameAs?: readonly (string | undefined)[];
}

/** The pakar as a schema.org Person. */
export function personLd(i: PersonInput) {
  const sameAs = [...new Set((i.sameAs ?? []).filter((u): u is string => !!u))];
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${i.url}#person`,
    url: i.url,
    name: i.name,
    jobTitle: i.field,
    knowsAbout: i.field,
    description: i.description,
    ...(sameAs.length ? { sameAs } : {}),
  };
}

interface ProfilePageInput extends PersonInput {
  locale: Locale;
  /** Date the profile last changed (YYYY-MM-DD). */
  dateModified?: string;
  /** The profile's social card: an absolute URL or a site path (pakarOg(...).src). */
  image?: string;
}

/** schema.org ProfilePage for a pakar page; the Person is its mainEntity and the language sits on the page. */
export function profilePageLd(i: ProfilePageInput) {
  const { '@context': _context, ...person } = personLd(i);
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: i.url,
    inLanguage: i.locale,
    ...(i.dateModified ? { dateModified: i.dateModified } : {}),
    ...(i.image ? { image: absolute(i.image) } : {}),
    publisher: organizationLd(i.locale),
    mainEntity: person,
  };
}

interface ArticleInput { url: string; headline: string; description: string; datePublished: string; dateModified?: string; image?: string; locale: Locale }

/** A page written by the site's founder (for example the manifesto). */
export function articleLd(i: ArticleInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: i.url,
    headline: articleHeadline(i.headline, i.locale),
    description: i.description,
    inLanguage: i.locale,
    datePublished: i.datePublished,
    dateModified: i.dateModified ?? i.datePublished,
    ...(i.image ? { image: i.image } : {}),
    author: authorLd(i.locale),
    publisher: organizationLd(i.locale),
  };
}

type PageType = 'WebPage' | 'CollectionPage' | 'AboutPage';
interface PageInput { type?: PageType; name: string; path: string; locale: Locale; description: string }

/** A plain page (hub, collection, about) with the site as its publisher. */
export function pageLd(i: PageInput) {
  return {
    '@context': 'https://schema.org',
    '@type': i.type ?? 'WebPage',
    name: i.name,
    url: absolute(i.path),
    inLanguage: i.locale,
    description: i.description,
    publisher: organizationLd(i.locale),
  };
}

/** An ordered list of pages (claims on /klaim, experts on /pakar). Pass curated entries only, never generated ones. */
export function itemListLd(i: { name: string; path: string; items: readonly { name: string; path: string }[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: i.name,
    url: absolute(i.path),
    numberOfItems: i.items.length,
    itemListElement: i.items.map((it, n) => ({ '@type': 'ListItem', position: n + 1, name: it.name, url: absolute(it.path) })),
  };
}

interface VideoInput {
  name: string;
  /** Left out when the data has none; never made up. */
  description?: string;
  /** Site path or absolute URL of the thumbnail. */
  thumbnail: string;
  /** ISO date or date-time. A video without one is skipped (Google requires it). */
  uploadDate?: string;
  embedUrl: string;
  /** Where the video can be watched on its platform. */
  url: string;
}

/** schema.org VideoObject, or undefined when a required value (name, thumbnail, uploadDate) is missing. */
export function videoLd(v: VideoInput) {
  if (!v.name || !v.thumbnail || !v.uploadDate) return undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.name,
    ...(v.description ? { description: v.description } : {}),
    thumbnailUrl: absolute(v.thumbnail),
    uploadDate: v.uploadDate,
    embedUrl: v.embedUrl,
    url: v.url,
  };
}

/** Upload time encoded in a TikTok video id (its top 32 bits are Unix seconds), as an ISO date-time. */
export function tiktokUploadDate(id: string): string | undefined {
  if (!/^\d{10,25}$/.test(id)) return undefined;
  const secs = Number(BigInt(id) >> 32n);
  return secs > 1_400_000_000 ? new Date(secs * 1000).toISOString().replace('.000Z', 'Z') : undefined;
}

interface EvidenceImageInput {
  src: string;
  caption: string;
  /** The page section the image belongs to (absolute URL). */
  pageUrl: string;
  /** Who the material comes from (bukti.source); left out when unknown. */
  source?: string;
  /** False for screenshots of someone else's material: no CC BY claim, credit goes to the source. */
  siteAuthored: boolean;
}

/**
 * An evidence image. Only an image the site made itself carries the site's CC BY 4.0 license; a screenshot of a third
 * party's material credits that source and makes no license claim (LICENSE-CONTENT.md: evidence screenshots stay
 * under their owners' terms).
 */
export function evidenceImageLd(i: EvidenceImageInput) {
  return {
    '@type': 'ImageObject',
    contentUrl: absolute(i.src),
    url: i.pageUrl,
    caption: i.caption,
    ...(i.siteAuthored
      ? { license: CONTENT_LICENSE, acquireLicensePage: `${SITE.repo}/blob/main/LICENSE-CONTENT.md`, creditText: SITE.name, copyrightNotice: `${SITE.name} (${SITE.url.replace(/^https:\/\//, '')})` }
      : i.source ? { creditText: i.source } : {}),
  };
}

import { SITE } from './site';
import type { Locale } from '../i18n';

export const CONTENT_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';

/** The site as a publisher: a stable @id and a logo, so every page names the same entity. */
export const publisher = {
  '@type': 'Organization',
  '@id': `${SITE.url}/#organization`,
  name: SITE.name,
  url: SITE.url,
  logo: { '@type': 'ImageObject', url: `${SITE.url}/apple-touch-icon.png` },
} as const;

/** The publisher tied to its public source repository, so the organisation behind a review is inspectable. */
const publisherWithSameAs = { ...publisher, sameAs: [SITE.repo] };

/** A site path (such as an OG card's src) made absolute; absolute URLs pass through. */
const absolute = (u: string) => new URL(u, SITE.url).toString();

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
    author: { ...publisherWithSameAs },
    publisher: { ...publisherWithSameAs },
    itemReviewed: {
      '@type': 'Claim',
      author: { '@type': 'Person', ...(i.pakarUrl ? { '@id': `${i.pakarUrl}#person` } : {}), name: i.pakarName },
      ...(i.claimMadeAt ? { datePublished: i.claimMadeAt } : {}),
      ...(appearance ? { appearance: [appearance], firstAppearance: appearance } : {}),
    },
    reviewRating: { '@type': 'Rating', name: i.verdictLabel, alternateName: i.verdictLabel },
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
    publisher: { ...publisherWithSameAs },
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
    headline: i.headline.slice(0, 110),
    description: i.description,
    inLanguage: i.locale,
    datePublished: i.datePublished,
    dateModified: i.dateModified ?? i.datePublished,
    ...(i.image ? { image: i.image } : {}),
    author: { '@type': 'Person', name: SITE.author, url: `${SITE.url}/tentang` },
    publisher: { ...publisher },
  };
}

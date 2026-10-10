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

interface ClaimReviewInput {
  url: string;
  claim: string;
  pakarName: string;
  /** Text label of the verdict, in the page language. The verdict scale is not numeric, so no ratingValue is emitted. */
  verdictLabel: string;
  /** "What this does not prove": published as the review body so the limits travel with the verdict. */
  limits: string;
  /** Date the check was last reviewed (YYYY-MM-DD). */
  datePublished: string;
  /** URL of the claimant's profile page; links the claim's author to the Person entity. */
  pakarUrl?: string;
  locale: Locale;
  /** Left out of the output when unknown. */
  claimMadeAt?: string;
}

/** schema.org ClaimReview for a claim check. Authored by the site, about a claim made by a pakar. */
export function claimReviewLd(i: ClaimReviewInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ClaimReview',
    url: i.url,
    inLanguage: i.locale,
    datePublished: i.datePublished,
    dateModified: i.datePublished,
    license: CONTENT_LICENSE,
    claimReviewed: i.claim,
    reviewBody: i.limits,
    author: { ...publisher },
    itemReviewed: {
      '@type': 'Claim',
      author: { '@type': 'Person', ...(i.pakarUrl ? { '@id': `${i.pakarUrl}#person` } : {}), name: i.pakarName },
      ...(i.claimMadeAt ? { datePublished: i.claimMadeAt } : {}),
    },
    reviewRating: { '@type': 'Rating', alternateName: i.verdictLabel },
  };
}

interface PersonInput { url: string; name: string; field: string; description: string; locale: Locale }

export function personLd(i: PersonInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${i.url}#person`,
    url: i.url,
    name: i.name,
    knowsAbout: i.field,
    description: i.description,
    inLanguage: i.locale,
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

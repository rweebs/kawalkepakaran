import { SITE } from './site';
import type { Locale } from '../i18n';

const publisher = { '@type': 'Organization', name: SITE.name, url: SITE.url } as const;

interface ClaimReviewInput {
  url: string;
  claim: string;
  pakarName: string;
  /** Text label of the verdict, in the page language. The verdict scale is not numeric, so no ratingValue is emitted. */
  verdictLabel: string;
  /** "What this does not prove": published as the review body so the limits travel with the verdict. */
  limits: string;
  datePublished: string;
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
    claimReviewed: i.claim,
    reviewBody: i.limits,
    author: { ...publisher },
    itemReviewed: {
      '@type': 'Claim',
      author: { '@type': 'Person', name: i.pakarName },
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

interface ArticleInput { url: string; headline: string; description: string; datePublished: string; locale: Locale }

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
    dateModified: i.datePublished,
    author: { '@type': 'Person', name: SITE.author },
    publisher: { ...publisher },
  };
}

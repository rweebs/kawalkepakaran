import type { Locale } from '../i18n';
import { SITE } from './site';

// The "suggest a claim" page (/usulkan, /en/suggest) builds either a prefilled GitHub issue (the repo's issue form
// .github/ISSUE_TEMPLATE/submit-claim.yml, whose field ids are pakar, claim and evidence) or a prefilled email. Nothing is sent to
// this site: the CSP allows forms to post only to 'self', so a bundled script builds the URL and navigates to it.

export const ISSUE_NEW_URL = `${SITE.repo}/issues/new`;
export const ISSUE_TEMPLATE = 'submit-claim.yml';
/** The issue form with nothing filled in: the no-JavaScript link. */
export const ISSUE_FORM_URL = `${ISSUE_NEW_URL}?template=${ISSUE_TEMPLATE}`;

export interface Suggestion {
  pakar: string;
  claim: string;
  /** Where the claim was made (a URL). */
  venueUrl: string;
  /** Evidence links, one per line. */
  evidence: string;
  /** Optional contact address; only ever put in the email, never in the public GitHub issue. */
  email?: string;
}

// GitHub rejects very long prefill URLs; each field is capped well below that.
const MAX_FIELD = 2000;
const cap = (s: string) => {
  const t = s.replace(/\r\n/g, '\n').trim();
  return t.length > MAX_FIELD ? `${t.slice(0, MAX_FIELD - 1)}…` : t;
};

const T = {
  id: {
    venue: 'Disampaikan di', email: 'Email pengirim', subject: 'Usulan klaim untuk diperiksa',
    pakar: 'Nama pakar', claim: 'Klaim (kutip persis)', evidence: 'Bukti (tautan, satu per baris)',
    consent: 'Saya menyatakan klaim ini disampaikan di depan publik, sumbernya dapat diperiksa, data pribadi orang yang tidak terkait sudah ditutup, dan pakar yang disebut berhak menjawab.',
  },
  en: {
    venue: 'Made at', email: 'Sender email', subject: 'Claim suggested for checking',
    pakar: 'Expert name', claim: 'Claim (quote it exactly)', evidence: 'Evidence (links, one per line)',
    consent: 'I confirm this claim was made in public, its sources can be checked, personal data of unrelated people is masked, and the expert named has the right of reply.',
  },
} as const;

/** A prefilled GitHub issue from the submit-claim form. The email is deliberately left out: issues are public. */
export function issueUrl(s: Suggestion, locale: Locale): string {
  const t = T[locale];
  const u = new URL(ISSUE_NEW_URL);
  u.searchParams.set('template', ISSUE_TEMPLATE);
  u.searchParams.set('title', `[claim] ${cap(s.pakar)}`.slice(0, 200));
  u.searchParams.set('pakar', cap(s.pakar));
  u.searchParams.set('claim', [cap(s.claim), '', `${t.venue}: ${cap(s.venueUrl)}`].join('\n'));
  u.searchParams.set('evidence', cap(s.evidence));
  return u.toString();
}

/** The email body: filled from the form when given, otherwise an empty template to complete by hand (the no-JavaScript link). */
export function mailtoUrl(s: Suggestion | undefined, locale: Locale, to: string = SITE.correctionsEmail): string {
  const t = T[locale];
  const v = (x: string | undefined) => (x ? cap(x) : '');
  const body = [
    `${t.pakar}: ${v(s?.pakar)}`,
    '',
    `${t.claim}:`,
    v(s?.claim),
    '',
    `${t.venue}: ${v(s?.venueUrl)}`,
    '',
    `${t.evidence}:`,
    v(s?.evidence),
    '',
    `${t.email}: ${v(s?.email)}`,
    '',
    t.consent,
  ].join('\n');
  const subject = s?.pakar ? `${t.subject}: ${cap(s.pakar).slice(0, 120)}` : t.subject;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

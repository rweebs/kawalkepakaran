import { formatDateLocale, localizedPath, type Locale } from '../i18n';
import { claimFeedItem, type FeedItem } from './feed';
import { claimOg } from './og';
import type { Verdict } from './schemas';
import { verdictLabel } from './verdict';

// One feed per hand-made expert profile: that expert's claim checks, plus one item per reply received, so a reader can follow
// a single case without the rest of the site. Generated (archive) profiles and claims never get a feed.

export interface PakarFeedClaim {
  id: string;
  claim: string; claimEn: string;
  verdict: Verdict;
  evidence: readonly string[];
  replyStatus: 'belum-ada' | 'diterima' | 'dipublikasikan';
  limits: string; limitsEn: string;
  finding?: string; findingEn?: string;
  madeAt?: Date; reviewedAt?: Date;
  reply?: { receivedAt: Date };
}

/** /pakar/<id>/rss.xml or /en/experts/<id>/rss.xml */
export const pakarFeedPath = (id: string, locale: Locale): string => `${localizedPath('experts', locale, id)}/rss.xml`;

const T = {
  id: {
    title: (name: string) => `${name} · Kawal Kepakaran`,
    description: (name: string) => `Cek klaim dan tanggapan tentang ${name} di Kawal Kepakaran. Catatan dan pendapat penulis, bukan putusan; hak jawab terbuka.`,
    replyTitle: 'Tanggapan diterima',
    replySummary: (name: string, date: string) => `Tanggapan ${name} diterima pada ${date} dan dimuat apa adanya, tanpa penyuntingan, di halaman klaim.`,
    category: 'Hak jawab',
  },
  en: {
    title: (name: string) => `${name} · Kawal Kepakaran`,
    description: (name: string) => `Claim checks and replies about ${name} on Kawal Kepakaran. The author's notes and opinion, not a ruling; the right of reply is open.`,
    replyTitle: 'Reply received',
    replySummary: (name: string, date: string) => `A reply from ${name} was received on ${date} and is published as received, unedited, on the claim page.`,
    category: 'Right of reply',
  },
} as const;

/** Channel title and description for an expert's feed. */
export function pakarFeedChannel(name: string, locale: Locale): { name: string; description: string } {
  return { name: T[locale].title(name), description: T[locale].description(name) };
}

/** The expert's claim checks (via claimFeedItem) and a dated item for each reply received. */
export function pakarFeedItems(pakarName: string, claims: readonly PakarFeedClaim[], locale: Locale, siteUrl: string, fallbackDate: Date): FeedItem[] {
  const t = T[locale];
  return claims.flatMap((k) => {
    const path = localizedPath('claims', locale, k.id);
    const claim = locale === 'id' ? k.claim : k.claimEn;
    const label = verdictLabel(k.verdict, locale);
    const review = claimFeedItem({
      id: k.id, path, pakarName, claim, verdict: k.verdict, evidenceCount: k.evidence.length, replyStatus: k.replyStatus,
      limits: locale === 'id' ? k.limits : k.limitsEn, finding: locale === 'id' ? k.finding : k.findingEn,
      date: k.reviewedAt ?? k.madeAt ?? fallbackDate, reviewedAt: k.reviewedAt, replyReceivedAt: k.reply?.receivedAt,
      image: claimOg(k.id, locale, claim, label),
    }, locale, siteUrl);
    if (!k.reply) return [review];
    const reply: FeedItem = {
      title: `${pakarName}: ${t.replyTitle} — ${claim}`,
      path: `${path}#tanggapan`,
      date: k.reply.receivedAt,
      summary: t.replySummary(pakarName, formatDateLocale(k.reply.receivedAt, locale)),
      categories: [t.category, pakarName],
    };
    return [review, reply];
  });
}

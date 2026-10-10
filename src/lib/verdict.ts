import type { Locale } from '../i18n';
import type { CredentialStatus, Verdict } from './schemas';

type Confidence = 'rendah' | 'sedang' | 'tinggi';
type ReplyStatus = 'belum-ada' | 'diterima' | 'dipublikasikan';

const VERDICT: Record<Verdict, Record<Locale, string>> = {
  'dikonfirmasi': { id: 'Dikonfirmasi', en: 'Confirmed' },
  'sebagian': { id: 'Sebagian', en: 'Partly' },
  'tidak-terbukti': { id: 'Tidak terbukti', en: 'Not supported' },
  'belum-terverifikasi': { id: 'Belum bisa diverifikasi', en: 'Cannot yet be verified' },
};

const CREDENTIAL: Record<CredentialStatus, Record<Locale, string>> = {
  'terverifikasi': { id: 'Terverifikasi', en: 'Verified' },
  'tidak-ditemukan': { id: 'Tidak ditemukan', en: 'Not found' },
  'bertentangan': { id: 'Bertentangan dengan sumber', en: 'Contradicted by sources' },
  'belum-terverifikasi': { id: 'Belum bisa diverifikasi', en: 'Cannot yet be verified' },
  'belum-diperiksa': { id: 'Belum diperiksa', en: 'Not yet checked' },
};

const CONFIDENCE: Record<Confidence, Record<Locale, string>> = {
  rendah: { id: 'Rendah', en: 'Low' },
  sedang: { id: 'Sedang', en: 'Medium' },
  tinggi: { id: 'Tinggi', en: 'High' },
};

const REPLY: Record<ReplyStatus, Record<Locale, string>> = {
  'belum-ada': { id: 'Belum ada tanggapan', en: 'No reply yet' },
  'diterima': { id: 'Tanggapan diterima', en: 'Reply received' },
  'dipublikasikan': { id: 'Tanggapan dipublikasikan', en: 'Reply published' },
};

export const verdictLabel = (v: Verdict, l: Locale): string => VERDICT[v][l];
export const credentialLabel = (s: CredentialStatus, l: Locale): string => CREDENTIAL[s][l];
export const confidenceLabel = (c: Confidence, l: Locale): string => CONFIDENCE[c][l];
export const replyStatusLabel = (r: ReplyStatus, l: Locale): string => REPLY[r][l];

interface FindingInput {
  verdict: Verdict; replyStatus: ReplyStatus; evidenceCount: number;
  finding?: string; findingEn?: string;
}

/** The one quotable line for a claim: the author's own finding when written, otherwise a neutral sentence built only from the
 *  recorded verdict, evidence count and reply status, so nothing is asserted that the data does not hold. */
export function findingFor(k: FindingInput, l: Locale): string {
  const own = l === 'en' ? k.findingEn ?? undefined : k.finding;
  if (own) return own;
  const n = k.evidenceCount;
  const items = l === 'id' ? `${n} bukti diperiksa` : `${n} evidence item${n === 1 ? '' : 's'} checked`;
  return `${verdictLabel(k.verdict, l)}: ${items}; ${replyStatusLabel(k.replyStatus, l).toLowerCase()}.`;
}

const DAY = 86_400_000;

/** Reply status with the request date and the days elapsed, when the request has been recorded. */
export function replyLine(k: { replyStatus: ReplyStatus; replyRequestedAt?: Date }, l: Locale, fmt: (d: Date) => string, now = new Date()): string {
  const base = replyStatusLabel(k.replyStatus, l);
  if (!k.replyRequestedAt || k.replyStatus !== 'belum-ada') return base;
  const days = Math.max(0, Math.floor((now.getTime() - k.replyRequestedAt.getTime()) / DAY));
  return l === 'id' ? `${base} · diminta ${fmt(k.replyRequestedAt)} (${days} hari)` : `${base} · requested ${fmt(k.replyRequestedAt)} (${days} days)`;
}

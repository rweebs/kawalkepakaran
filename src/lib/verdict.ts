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

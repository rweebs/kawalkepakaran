// /llms-full.txt: the hand-checked claims as plain Markdown-ish text, one block per claim, in Indonesian then English.
import type { Verdict } from './schemas';
import { confidenceLabel, verdictLabel } from './verdict';
import type { Locale } from '../i18n';

export interface LlmsClaim {
  id: string;
  expert: string;
  claim: string;
  claimEn: string;
  verdict: Verdict;
  confidence: 'rendah' | 'sedang' | 'tinggi';
  limits: string;
  limitsEn: string;
  reviewedAt?: Date;
}

const T: Record<Locale, { heading: string; expert: string; verdict: string; confidence: string; limits: string; reviewed: string; path: string }> = {
  id: { heading: 'Klaim yang diperiksa (Bahasa Indonesia)', expert: 'Pakar', verdict: 'Putusan', confidence: 'Keyakinan', limits: 'Yang tidak dibuktikan', reviewed: 'Ditinjau', path: '/klaim/' },
  en: { heading: 'Checked claims (English)', expert: 'Expert', verdict: 'Verdict', confidence: 'Confidence', limits: 'What this does not prove', reviewed: 'Reviewed', path: '/en/claims/' },
};

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function section(claims: readonly LlmsClaim[], locale: Locale, site: string): string[] {
  const t = T[locale];
  return [`## ${t.heading}`, '', ...claims.flatMap((c) => [
    `### ${oneLine(locale === 'id' ? c.claim : c.claimEn)}`,
    `- URL: ${new URL(t.path + c.id, site).toString()}`,
    `- ${t.expert}: ${oneLine(c.expert)}`,
    `- ${t.verdict}: ${verdictLabel(c.verdict, locale)}`,
    `- ${t.confidence}: ${confidenceLabel(c.confidence, locale)}`,
    ...(c.reviewedAt ? [`- ${t.reviewed}: ${c.reviewedAt.toISOString().slice(0, 10)}`] : []),
    `- ${t.limits}: ${oneLine(locale === 'id' ? c.limits : c.limitsEn)}`,
    '',
  ])];
}

/** The whole file; claims sorted by expert then id, so an unchanged collection rebuilds byte-identical. */
export function llmsFull(claims: readonly LlmsClaim[], site: { name: string; url: string; description: string }): string {
  const sorted = [...claims].sort((a, b) => a.expert.localeCompare(b.expert) || a.id.localeCompare(b.id));
  return [
    `# ${site.name}: claims in full`,
    '',
    `> ${site.description} Isi situs adalah pendapat dan catatan penulis, bukan putusan pengadilan; setiap orang berhak atas praduga tak bersalah dan hak jawab.`,
    '> The site holds the author\'s opinions and notes, not court findings; everyone named is presumed innocent and has a right of reply.',
    '',
    `Index: ${new URL('/llms.txt', site.url).toString()} · JSON: ${new URL('/klaim.json', site.url).toString()}`,
    '',
    ...section(sorted, 'id', site.url),
    ...section(sorted, 'en', site.url),
  ].join('\n');
}

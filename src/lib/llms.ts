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

export interface LlmsPage { path: string; label: string; group: 'pages' | 'claims' | 'articles' }

const INDEX_HEADINGS: Record<LlmsPage['group'], string> = {
  pages: 'Halaman / Pages',
  claims: 'Pakar dan klaim / Experts and claims',
  articles: 'Artikel dan linimasa / Articles and timeline',
};

/** /llms.txt: every page the sitemap lists, grouped like the child sitemaps, so a model can reach all of them from one file. */
export function llmsIndex(pages: readonly LlmsPage[], site: { name: string; url: string; description: string }): string {
  const seen = new Set<string>();
  const unique = pages.filter((p) => (seen.has(p.path) ? false : (seen.add(p.path), true)));
  const groups = (['pages', 'claims', 'articles'] as const).flatMap((g) => {
    const items = unique.filter((p) => p.group === g).sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)));
    return items.length ? [`## ${INDEX_HEADINGS[g]}`, ...items.map((p) => `- [${oneLine(p.label)}](${new URL(p.path, site.url).toString()})`), ''] : [];
  });
  return [
    `# ${site.name}`,
    '',
    `> ${site.description} Isi situs adalah pendapat dan catatan penulis, bukan putusan pengadilan; setiap orang berhak atas praduga tak bersalah dan hak jawab.`,
    '> The site holds the author\'s opinions and notes, not court findings; everyone named is presumed innocent and has a right of reply.',
    '',
    ...groups,
    '## Opsional / Optional',
    `- [Semua klaim beserta putusan dan batasnya / All claims with verdicts and limits](${new URL('/llms-full.txt', site.url)})`,
    `- [Klaim sebagai JSON / Claims as JSON](${new URL('/klaim.json', site.url)})`,
    `- [Sitemap](${new URL('/sitemap.xml', site.url)})`,
    `- [RSS](${new URL('/rss.xml', site.url)})`,
    `- [RSS (English)](${new URL('/en/rss.xml', site.url)})`,
    '',
  ].join('\n');
}

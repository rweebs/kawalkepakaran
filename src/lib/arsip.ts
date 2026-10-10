import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { visibleArsip } from './arsip-refs';
import { localizedPath, type Locale } from '../i18n';
import { truncateAtWord } from './seo';

const INCLUDE_DRAFTS = includeDrafts(process.env);

export async function getArsip() {
  return visibleArsip(await getCollection('arsip'), INCLUDE_DRAFTS);
}

/** The archive posts that name a party (a /pakar profile), by title. */
export async function articlesForPakar(slug: string) {
  return (await getArsip()).filter((a) => a.data.parties.includes(slug)).sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export const arsipPath = (id: string, locale: Locale) => `${localizedPath('archive', locale)}/${locale === 'id' ? 'artikel' : 'articles'}/${id}`;

export const KIND_LABEL = {
  somasi: { id: 'Somasi', en: 'Legal notice' }, aduan: { id: 'Aduan', en: 'Complaint' }, ringkasan: { id: 'Ringkasan sengketa', en: 'Dispute summary' },
  analisis: { id: 'Analisis', en: 'Analysis' }, catatan: { id: 'Catatan', en: 'Note' },
} as const;
export const STATUS_LABEL = {
  'dikirim': { id: 'Dikirim', en: 'Sent' }, 'diajukan': { id: 'Diajukan', en: 'Filed' }, 'dijawab': { id: 'Dijawab', en: 'Answered' },
  'diputus': { id: 'Diputus', en: 'Decided' }, 'tidak-diketahui': { id: 'Tidak disebut sumber', en: 'Not stated by the source' },
} as const;
export const PAKAR_KIND_LABEL = {
  Person: { id: 'Orang', en: 'People' }, Company: { id: 'Perusahaan dan organisasi', en: 'Companies and organisations' }, Group: { id: 'Kelompok', en: 'Groups' },
} as const;

// A short title without characters that grow in HTML (& becomes &amp;), so the page title stays within the 65-character limit.
const shorten = (title: string, max: number) => truncateAtWord(title.replace(/&/g, 'and').replace(/["“”]/g, ''), max);

/** Static paths for an archive post page. Titles that collide once shortened get a number, so no two pages share a <title>. */
export async function arsipStaticPaths() {
  const entries = (await getArsip()).sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, string[]>();
  for (const e of entries) {
    const k = shorten(e.data.title, 48);
    groups.set(k, [...(groups.get(k) ?? []), e.id]);
  }
  return entries.map((entry) => {
    const k = shorten(entry.data.title, 48);
    const same = groups.get(k)!;
    const shortTitle = same.length > 1 ? `${shorten(entry.data.title, 42)} #${same.indexOf(entry.id) + 1}` : k;
    return { params: { slug: entry.id }, props: { entry, shortTitle } };
  });
}

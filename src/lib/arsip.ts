import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { visibleArsip } from './arsip-refs';
import { localizedPath, type Locale } from '../i18n';

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

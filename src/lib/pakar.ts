import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { assertArsipPartiesExist, assertKlaimRefsContent, assertKlaimRefsPakar, selectVisible } from './pakar-refs';

export { assertKlaimRefsPakar };

/** Extra pages that belong to one expert's profile (a timeline, evidence, articles), shown as a "Materials" section on that profile. */
export const EXPERT_MATERIALS: Record<string, { route: 'caseHome' | 'abilTimeline' | 'evidence' | 'articles'; label: { id: string; en: string } }[]> = {
  'abil-sudarman': [
    { route: 'caseHome', label: { id: 'Ringkasan klaim dan hasil', en: 'Claims and results overview' } },
    { route: 'abilTimeline', label: { id: 'Linimasa', en: 'Timeline' } },
    { route: 'evidence', label: { id: 'Bukti', en: 'Evidence' } },
    { route: 'articles', label: { id: 'Artikel', en: 'Articles' } },
  ],
};

const INCLUDE_DRAFTS = includeDrafts(process.env);

async function visible() {
  const [pakar, klaim, bukti, arsip] = await Promise.all([getCollection('pakar'), getCollection('klaim'), getCollection('bukti'), getCollection('arsip')]);
  assertKlaimRefsContent(bukti.map((b) => b.id), arsip.map((a) => a.id), klaim);
  assertArsipPartiesExist(pakar.map((p) => p.id), arsip);
  return selectVisible(pakar, klaim, INCLUDE_DRAFTS);
}

/** Pakar that may be shown; throws if a shown claim names a missing or draft pakar. */
export async function getPakar() {
  return (await visible()).pakar;
}

/** Claims that may be shown; throws if a claim names a missing pakar, or a shown claim names a draft pakar. */
export async function getKlaim() {
  return (await visible()).klaim;
}

export async function klaimForPakar(slug: string) {
  return (await getKlaim()).filter((k) => k.data.pakar === slug);
}

/** A profile or claim generated from the archive (not curated by hand): it is indexed like any page, but kept out of the home page, feeds and the JSON data. */
export const isGenerated = (entry: { data: { source?: string } }): boolean => entry.data.source === 'arsip';

import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { assertKlaimRefsPakar } from './pakar-refs';

export { assertKlaimRefsPakar };

const INCLUDE_DRAFTS = includeDrafts(process.env);

export async function getPakar() {
  return getCollection('pakar', (e) => INCLUDE_DRAFTS || !e.data.draft);
}

/** Published claims; throws if any claim (draft or not) names a pakar without a profile. */
export async function getKlaim() {
  const [pakar, klaim] = await Promise.all([getCollection('pakar'), getCollection('klaim')]);
  assertKlaimRefsPakar(pakar.map((p) => p.id), klaim);
  return klaim.filter((k) => INCLUDE_DRAFTS || !k.data.draft);
}

export async function klaimForPakar(slug: string) {
  return (await getKlaim()).filter((k) => k.data.pakar === slug);
}

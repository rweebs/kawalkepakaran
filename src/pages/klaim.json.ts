import type { APIRoute } from 'astro';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { SITE } from '../lib/site';

/** All published claims as JSON, for researchers and other fact-checkers. Claims made from the archive are flagged `generated`. */
export const GET: APIRoute = async () => {
  const pakar = new Map((await getPakar()).map((p) => [p.id, p.data.name]));
  const claims = (await getKlaim()).map((k) => ({
    id: k.id,
    url: new URL(`/klaim/${k.id}`, SITE.url).toString(),
    expert: pakar.get(k.data.pakar) ?? k.data.pakar,
    claim: k.data.claim,
    claimEn: k.data.claimEn,
    venue: k.data.venue,
    madeAt: k.data.madeAt?.toISOString().slice(0, 10) ?? null,
    verdict: k.data.verdict,
    confidence: k.data.confidence,
    replyStatus: k.data.replyStatus,
    limits: k.data.limits,
    generated: isGenerated(k),
  }));
  return new Response(JSON.stringify({ site: SITE.url, license: 'see LICENSE-CONTENT.md', claims }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};

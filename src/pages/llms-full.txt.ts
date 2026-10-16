import type { APIRoute } from 'astro';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { llmsFull, type LlmsClaim } from '../lib/llms';
import { SITE } from '../lib/site';

/** Every hand-checked claim with its verdict and limits, in both languages, for language models. Generated claims stay out. */
export const GET: APIRoute = async () => {
  const pakar = new Map((await getPakar()).map((p) => [p.id, p.data.name]));
  const claims: LlmsClaim[] = (await getKlaim()).filter((k) => !isGenerated(k)).map((k) => ({
    id: k.id,
    expert: pakar.get(k.data.pakar) ?? k.data.pakar,
    claim: k.data.claim,
    claimEn: k.data.claimEn,
    verdict: k.data.verdict,
    confidence: k.data.confidence,
    limits: k.data.limits,
    limitsEn: k.data.limitsEn,
    reviewedAt: k.data.reviewedAt,
  }));
  return new Response(llmsFull(claims, SITE), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { pakarSchema, klaimSchema, arsipSchema } from '../src/lib/schemas';
import { assertKlaimRefsPakar, assertKlaimRefsContent, assertArsipPartiesExist, selectVisible } from '../src/lib/pakar-refs';

const pakar = { name: 'A', field: 'f', summary: 's', summaryEn: 's', credentials: [] };
const klaim = {
  pakar: 'a', claim: 'c', claimEn: 'c', venue: 'v',
  verdict: 'belum-terverifikasi', confidence: 'sedang', evidence: [], reviewedAt: '2026-10-11', limits: 'l', limitsEn: 'l', replyStatus: 'belum-ada',
};

describe('schemas', () => {
  it('accepts a pakar with no credentials', () => expect(pakarSchema.safeParse(pakar).success).toBe(true));
  it('rejects an unknown verdict', () =>
    expect(klaimSchema.safeParse({ ...klaim, verdict: 'benar' }).success).toBe(false));
  it('requires limits (what this does not prove)', () =>
    expect(klaimSchema.safeParse({ ...klaim, limits: '' }).success).toBe(false));
  it('accepts a claim whose date is unknown, and parses a given date', () => {
    expect(klaimSchema.safeParse(klaim).success).toBe(true);
    expect(klaimSchema.safeParse({ ...klaim, madeAt: '2026-01-02' }).success).toBe(true);
  });
});

describe('klaim review rules', () => {
  it('requires reviewedAt on a hand-made claim but not on one generated from the archive', () => {
    const { reviewedAt: _r, ...noDate } = klaim;
    expect(klaimSchema.safeParse(noDate).success).toBe(false);
    expect(klaimSchema.safeParse({ ...noDate, source: 'arsip' }).success).toBe(true);
  });
  it('rejects a decided verdict with no evidence', () => {
    expect(klaimSchema.safeParse({ ...klaim, verdict: 'tidak-terbukti' }).success).toBe(false);
    expect(klaimSchema.safeParse({ ...klaim, verdict: 'tidak-terbukti', evidence: ['01-x'] }).success).toBe(true);
  });
  it('needs the reply text once a reply is published', () => {
    expect(klaimSchema.safeParse({ ...klaim, replyStatus: 'dipublikasikan' }).success).toBe(false);
    expect(klaimSchema.safeParse({ ...klaim, replyStatus: 'dipublikasikan', reply: { receivedAt: '2026-10-12', text: 'Jawaban' } }).success).toBe(true);
  });
});

describe('https-only URLs', () => {
  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://example.com'])('rejects %s as an archive source', (u) => {
    expect(arsipSchema.safeParse({ title: 't', sourceUrl: u, archivedAt: '2026-01-01', lang: 'id', kind: 'catatan' }).success).toBe(false);
  });
  it('accepts https', () => {
    expect(arsipSchema.safeParse({ title: 't', sourceUrl: 'https://example.com/x', archivedAt: '2026-01-01', lang: 'id', kind: 'catatan' }).success).toBe(true);
  });
});

describe('dangling content references', () => {
  const k = { id: 'k1', data: { evidence: ['01-a'], articles: ['post-1'] } };
  it('throws on unknown evidence', () => expect(() => assertKlaimRefsContent([], ['post-1'], [k])).toThrow(/k1.*01-a/));
  it('throws on an unknown archive post', () => expect(() => assertKlaimRefsContent(['01-a'], [], [k])).toThrow(/post-1/));
  it('passes when everything exists', () => expect(() => assertKlaimRefsContent(['01-a'], ['post-1'], [k])).not.toThrow());
  it('throws on a misspelt party', () => expect(() => assertArsipPartiesExist(['a'], [{ id: 'x', data: { parties: ['b'] } }])).toThrow(/x.*b/));
});

describe('assertKlaimRefsPakar', () => {
  it('throws naming the orphan claim', () => {
    expect(() => assertKlaimRefsPakar(['a'], [{ id: 'k1', data: { pakar: 'zzz' } }])).toThrow(/k1.*zzz/);
  });
  it('passes when every claim has a profile', () => {
    expect(() => assertKlaimRefsPakar(['a'], [{ id: 'k1', data: { pakar: 'a' } }])).not.toThrow();
  });
});

describe('selectVisible (drafts)', () => {
  const p = (id: string, draft = false) => ({ id, data: { draft } });
  const k = (id: string, pakar: string, draft = false) => ({ id, data: { pakar, draft } });

  it('fails clearly when a published claim names a draft pakar', () => {
    expect(() => selectVisible([p('a', true)], [k('k1', 'a')], false)).toThrow(/k1.*a/);
  });
  it('hides a draft claim of a draft pakar without error', () => {
    const out = selectVisible([p('a', true), p('b')], [k('k1', 'a', true), k('k2', 'b')], false);
    expect(out.pakar.map((x) => x.id)).toEqual(['b']);
    expect(out.klaim.map((x) => x.id)).toEqual(['k2']);
  });
  it('shows drafts when asked to', () => {
    const out = selectVisible([p('a', true)], [k('k1', 'a', true)], true);
    expect(out.pakar).toHaveLength(1);
    expect(out.klaim).toHaveLength(1);
  });
  it('still fails on a claim naming a pakar that does not exist', () => {
    expect(() => selectVisible([p('a')], [k('k1', 'zzz', true)], false)).toThrow(/k1.*zzz/);
  });
});

describe('seeded content', () => {
  const json = (dir: string) =>
    readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ id: f.replace(/\.json$/, ''), data: JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) }));
  const pakarRows = json('src/content/pakar');
  const klaimRows = json('src/content/klaim');
  const buktiIds = new Set(json('src/content/bukti').map((b) => b.id));

  it('every seeded pakar and klaim validates against its schema', () => {
    for (const p of pakarRows) expect(pakarSchema.safeParse(p.data).success, p.id).toBe(true);
    for (const k of klaimRows) expect(klaimSchema.safeParse(k.data).success, k.id).toBe(true);
  });
  it('seeds Abil Sudarman with one claim per allegation', () => {
    expect(pakarRows.map((p) => p.id)).toContain('abil-sudarman');
    expect(klaimRows).toHaveLength(5);
  });
  it('every claim points at an existing pakar and existing evidence', () => {
    assertKlaimRefsPakar(pakarRows.map((p) => p.id), klaimRows);
    for (const k of klaimRows) for (const e of k.data.evidence) expect(buktiIds.has(e), `${k.id}: ${e}`).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { pakarSchema, klaimSchema } from '../src/lib/schemas';
import { assertKlaimRefsPakar, selectVisible } from '../src/lib/pakar-refs';

const pakar = { name: 'A', field: 'f', summary: 's', summaryEn: 's', credentials: [] };
const klaim = {
  pakar: 'a', claim: 'c', claimEn: 'c', venue: 'v',
  verdict: 'sebagian', confidence: 'sedang', evidence: [], limits: 'l', limitsEn: 'l', replyStatus: 'belum-ada',
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

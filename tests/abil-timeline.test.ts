import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ROUTES } from '../src/i18n';
import { NAV } from '../src/lib/site';
import { ABIL_ENTRIES, KIND_LABEL, UNDATED_SORT } from '../src/lib/abil-timeline';

const read = (p: string) => readFileSync(p, 'utf8');
const bukti = (id: string) => JSON.parse(read(`src/content/bukti/${id}.json`));

describe('Abil Sudarman timeline data', () => {
  it('has at least ten entries with unique ids and a known kind', () => {
    expect(ABIL_ENTRIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ABIL_ENTRIES.map((e) => e.id)).size).toBe(ABIL_ENTRIES.length);
    for (const e of ABIL_ENTRIES) expect(Object.keys(KIND_LABEL), e.id).toContain(e.kind);
  });
  it('lists dated entries in chronological order, then the undated ones', () => {
    const sorts = ABIL_ENTRIES.map((e) => e.when.sort);
    expect(sorts).toEqual([...sorts].sort());
    const firstUndated = sorts.indexOf(UNDATED_SORT);
    expect(firstUndated).toBeGreaterThan(0);
    for (const s of sorts.slice(firstUndated)) expect(s).toBe(UNDATED_SORT);
  });
  it('every entry has its own text and limits, or takes both from a bukti item that has them', () => {
    for (const e of ABIL_ENTRIES) {
      if (e.buktiId) {
        const b = bukti(e.buktiId);
        expect(b.shows && b.limits, e.id).toBeTruthy();
        expect(b.en?.shows && b.en?.limits, `${e.id} needs English bukti text`).toBeTruthy();
      } else {
        for (const l of ['id', 'en'] as const) {
          expect(e.title?.[l], `${e.id} title ${l}`).toBeTruthy();
          expect(e.text?.[l], `${e.id} text ${l}`).toBeTruthy();
          expect(e.limits?.[l], `${e.id} limits ${l}`).toBeTruthy();
        }
      }
    }
  });
  it('every entry cites at least one source that exists', () => {
    for (const e of ABIL_ENTRIES) {
      const srcs = [...e.sources, ...(e.buktiId ? [{ bukti: e.buktiId }] : [])];
      expect(srcs.length, e.id).toBeGreaterThan(0);
      for (const s of srcs) {
        if ('bukti' in s) expect(existsSync(`src/content/bukti/${s.bukti}.json`), `${e.id}: bukti ${s.bukti}`).toBe(true);
        else if ('artikel' in s) expect(existsSync(`src/content/posts/${s.artikel}.md`), `${e.id}: artikel ${s.artikel}`).toBe(true);
        else expect(s.url, e.id).toMatch(/^https:\/\//);
      }
    }
  });
  it('English text written for this page never assumes a pronoun for a real person', () => {
    for (const e of ABIL_ENTRIES) {
      const en = [e.title?.en, e.text?.en, e.limits?.en, e.when.en].filter(Boolean).join(' ');
      expect(en, e.id).not.toMatch(/\b(he|his|him|himself|she|her|hers)\b/i);
    }
  });
  it('the police-complaint entry carries its own limits: not proven, not a finding, not a ruling', () => {
    const e = ABIL_ENTRIES.find((x) => x.id === 'aduan-068')!;
    expect(e.kind).toBe('peristiwa');
    expect(e.when.sort).toBe('2026-09-21');
    expect(e.text!.id).toMatch(/belum terbukti/);
    expect(e.limits!.id).toMatch(/bukan temuan kepolisian/);
    expect(e.limits!.id).toMatch(/tidak menyatakan/);
  });
  it('never labels an entry as an accusation', () => {
    for (const e of ABIL_ENTRIES) {
      expect([e.title?.id, e.title?.en].join(' '), e.id).not.toMatch(/tuduh|accus/i);
    }
  });
});

describe('Abil Sudarman timeline pages', () => {
  it('has a route in both languages and both page files', () => {
    expect(ROUTES.abilTimeline.id).toBe('/kasus/abil-sudarman/linimasa-abil');
    expect(ROUTES.abilTimeline.en).toBe('/en/cases/abil-sudarman/abil-timeline');
    expect(existsSync('src/pages/kasus/abil-sudarman/linimasa-abil.astro')).toBe(true);
    expect(existsSync('src/pages/en/cases/abil-sudarman/abil-timeline.astro')).toBe(true);
  });
  it('is in the Kasus menu, the sitemap and the case landing page', () => {
    expect(NAV.map((n) => n.href)).toContain('/kasus/abil-sudarman/linimasa-abil');
    expect(read('src/pages/sitemap.xml.ts')).toContain('/kasus/abil-sudarman/linimasa-abil');
    expect(read('src/pages/kasus/abil-sudarman/index.astro')).toContain("routePath('abilTimeline'");
  });
  it('shows the undated section, the limits and the right of reply', () => {
    const s = read('src/pages/kasus/abil-sudarman/linimasa-abil.astro');
    expect(s).toContain('Tanpa tanggal pasti');
    expect(s).toContain('Undated');
    expect(s).toMatch(/routePath\('reply'/);
    expect(s).toContain('limits');
  });
  it("links to and from the author's own timeline", () => {
    expect(read('src/pages/kasus/abil-sudarman/linimasa-abil.astro')).toContain("routePath('timeline'");
    expect(read('src/pages/kasus/abil-sudarman/linimasa.astro')).toContain("routePath('abilTimeline'");
  });
});

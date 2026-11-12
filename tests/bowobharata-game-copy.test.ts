import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARVAS } from '../src/lib/bowobharata';
import type { Perkara } from '../src/lib/perkara';
import { buildChapters } from '../src/lib/bowobharata-game/record';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const totals = { people: 80, events: 300, reportsBy: 13, reportsAgainst: 4, excludedE: 6 };

/** Every key path, recursing into plain objects; arrays and functions are leaves. */
function keyPaths(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    const p = `${prefix}${k}`;
    return v && typeof v === 'object' && !Array.isArray(v) ? [p, ...keyPaths(v, `${p}.`)] : [p];
  });
}

/** Every player-facing string, including what the functions return. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (typeof v === 'function') return strings((v as (t: typeof totals) => unknown)(totals));
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

describe('bowobharata-game copy', () => {
  it('both locales have identical key sets, deep', () => {
    expect(keyPaths(GAME_COPY.en).sort()).toEqual(keyPaths(GAME_COPY.id).sort());
  });

  it('krishnaLine covers exactly the chapter ids, in both locales', () => {
    const ids = buildChapters(PARVAS, data.terlapor).map((c) => c.id).sort();
    for (const l of ['id', 'en'] as const) {
      expect(Object.keys(GAME_COPY[l].krishnaLine).sort()).toEqual(ids);
      for (const line of Object.values(GAME_COPY[l].krishnaLine)) expect(line.trim().length).toBeGreaterThan(0);
    }
  });

  it('allegation line is verbatim', () => {
    expect(GAME_COPY.id.allegation).toBe('Dugaan Pelapor, bukan temuan polisi. Praduga tak bersalah berlaku.');
    expect(GAME_COPY.en.allegation).toBe("The Pelapor's allegation, not a police finding. The presumption of innocence applies.");
  });

  it('fixed titles and finale close', () => {
    for (const l of ['id', 'en'] as const) expect(GAME_COPY[l].title).toBe('BOWOBHARATA');
    expect(GAME_COPY.id.prologueTitle).toBe('Sebelum Perang');
    expect(GAME_COPY.en.prologueTitle).toBe('Before the War');
    expect(GAME_COPY.id.sanjayaTitle).toBe('Laporan Sanjaya');
    expect(GAME_COPY.en.sanjayaTitle).toBe("Sanjaya's Report");
    expect(GAME_COPY.id.nameOnly).toBe('muncul lagi');
    expect(GAME_COPY.en.nameOnly).toBe('appears again');
    expect(GAME_COPY.id.finaleClose).toBe('Semua ini diarahkan kepada satu orang: Rahmat Wibowo.');
    expect(GAME_COPY.en.finaleClose).toBe('All of it was aimed at one person: Rahmat Wibowo.');
  });

  it('finaleTotals is built from the numbers, in both locales', () => {
    for (const l of ['id', 'en'] as const) {
      const text = GAME_COPY[l].finaleTotals(totals).join('\n');
      for (const n of ['80', '300', '13', '4', '6']) expect(text).toMatch(new RegExp(`\\b${n}\\b`));
    }
    expect(GAME_COPY.id.finaleTotals(totals).join('\n')).toContain('13 laporan dibuat Rahmat Wibowo, 4 laporan terhadapnya');
    expect(GAME_COPY.en.finaleTotals(totals).join('\n')).toContain('13 reports filed by Rahmat Wibowo, 4 filed against him');
  });

  it('no string shows anyone defeated, killed or slain (whole words)', () => {
    const banned = /\b(kalah|dibunuh|mati|defeated|killed|slain)\b/i;
    for (const l of ['id', 'en'] as const) {
      const all = strings(GAME_COPY[l]);
      expect(all.length).toBeGreaterThan(20);
      for (const s of all) expect(s, s).not.toMatch(banned);
    }
  });
});

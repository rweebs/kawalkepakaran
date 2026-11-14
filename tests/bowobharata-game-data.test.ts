import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PARVAS, parvaEvents } from '../src/lib/bowobharata';
import { eventPath, formatDateFor, localizeEvent } from '../src/lib/linimasa-locale';
import type { TerlaporKronologi } from '../src/lib/perkara';
import { perkara, islandData } from '../src/lib/pantau-props';
import { buildChapters, type SanjayaEntry } from '../src/lib/bowobharata-game/record';
import * as dataModule from '../src/lib/bowobharata-game/data';
import type { GameData } from '../src/lib/bowobharata-game/data';
import { eventCards, gameData, prologueRecords } from '../src/lib/bowobharata-game/data-build';

const read = (f: string) => readFileSync(f, 'utf8');
const data = gameData(perkara);

describe('event cards', () => {
  it('each parva chapter carries its events, the prologue and the finale none', () => {
    expect(data.events.map((e) => e.length)).toEqual([0, 2, 2, 4, 9, 1, 2, 2, 2, 0]);
    data.events.forEach((cards, i) => expect(cards).toEqual(eventCards(i)));
  });

  it('slugs follow the parvaEvents order', () => {
    PARVAS.forEach((p, i) => expect(data.events[i + 1].map((c) => c.slug)).toEqual(parvaEvents(p).map((e) => e.slug)));
  });

  it('title, path, channel and dateLabel match localizeEvent, eventPath and formatDateFor in each locale', () => {
    let n = 0;
    PARVAS.forEach((p, i) => parvaEvents(p).forEach((e, j) => {
      const card = data.events[i + 1][j];
      expect(card.date).toBe(e.date);
      for (const l of ['id', 'en'] as const) {
        const loc = localizeEvent(e, l);
        expect(card.title[l]).toBe(loc.title);
        expect(card.channel[l]).toBe(loc.channel);
        expect(card.path[l]).toBe(eventPath(loc, l));
        expect(card.dateLabel[l]).toBe(formatDateFor(e.date, l));
      }
      n++;
    }));
    expect(n).toBe(24);
  });
});

describe('prologue dates', () => {
  const prologue = buildChapters(PARVAS, perkara.terlapor)[0];
  const iso = (r: TerlaporKronologi) => r.iso ?? '';
  /** Each prologue full entry's earliest Perbuatan row, worked out here from the entries themselves. */
  const firstActs = prologue.entries.filter((e) => e.full).flatMap((e) => {
    const acts = e.rows.filter((r) => r.jenis === 'Perbuatan');
    return acts.length > 0 ? [acts.reduce((a, b) => (iso(b) < iso(a) ? b : a))] : [];
  });

  it('8 records, ascending by iso, each a date and nothing else', () => {
    expect(prologue.id).toBe('prologue');
    expect(data.prologue).toHaveLength(8);
    const isos = data.prologue.map((r) => r.iso);
    expect(isos).toEqual([...isos].sort());
    for (const r of data.prologue) expect(Object.keys(r).sort()).toEqual(['iso', 'label']);
  });

  it('each is the earliest Perbuatan row of a distinct prologue full entry, and no entry left out has an earlier one', () => {
    const left = [...firstActs];
    for (const rec of data.prologue) {
      const k = left.findIndex((r) => r.iso === rec.iso && r.tanggal === rec.label);
      expect(k, `${rec.iso} ${rec.label}`).toBeGreaterThan(-1);
      left.splice(k, 1);
    }
    const last = data.prologue[data.prologue.length - 1].iso;
    for (const r of left) expect(iso(r) >= last, `${r.iso} is earlier than ${last}`).toBe(true);
  });

  it('none is a Tanggapan row, even when the reply comes before the act', () => {
    const row = (jenis: string, d: string): TerlaporKronologi => ({ tanggal: `tanggal ${d}`, iso: d, precision: 'day', peristiwa: 'x', jenis });
    const entry = (id: string, rows: TerlaporKronologi[], full = true): SanjayaEntry =>
      ({ id, nama: id, kategori: 'A. Terlapor Perorangan', klaster: null, dugaan: '', pasal: [], laporan: [], rows, full });
    const entries = [
      entry('reply-first', [row('Tanggapan', '2023-01-01'), row('Perbuatan', '2023-03-01')]),
      entry('reply-only', [row('Tanggapan', '2023-02-01')]),
      entry('name-only', [row('Perbuatan', '2023-01-02')], false),
      entry('unsorted', [row('Perbuatan', '2023-04-01'), row('Perbuatan', '2023-01-15')]),
    ];
    expect(prologueRecords(entries)).toEqual([
      { iso: '2023-01-15', label: 'tanggal 2023-01-15' },
      { iso: '2023-03-01', label: 'tanggal 2023-03-01' },
    ]);
    expect(prologueRecords(entries, 1)).toEqual([{ iso: '2023-01-15', label: 'tanggal 2023-01-15' }]);
  });
});

describe('payload', () => {
  const json = JSON.stringify(islandData('bowobharata-game'));
  const served = JSON.parse(json) as GameData;

  it("every row's keys are iso, peristiwa and tanggal", () => {
    const rows = served.chapters.flatMap((c) => c.entries.flatMap((e) => e.rows));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['iso', 'peristiwa', 'tanggal']);
  });

  it('no chapter has a window key', () => {
    expect(served.chapters).toHaveLength(PARVAS.length + 2);
    for (const c of served.chapters) expect(c).not.toHaveProperty('window');
  });

  it('carries the event cards and the prologue dates, under 200,000 characters', () => {
    expect(served.events).toEqual(data.events);
    expect(served.prologue).toEqual(data.prologue);
    expect(json.length).toBeLessThan(200_000);
  });
});

describe('imports', () => {
  it('data.ts imports no builder: type-only imports, and GAME_DATA_SRC is its one runtime export', () => {
    const imports = read('src/lib/bowobharata-game/data.ts').match(/^import\b[\s\S]*?;$/gm) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    for (const s of imports) {
      expect(s).toMatch(/^import type /);
      expect(s).not.toMatch(/data-build|\.json'/);
    }
    expect(Object.keys(dataModule)).toEqual(['GAME_DATA_SRC']);
  });

  it('pantau-props.ts imports gameData from ./bowobharata-game/data-build, and no other source file imports the builders', () => {
    expect(read('src/lib/pantau-props.ts')).toContain("import { gameData } from './bowobharata-game/data-build';");
    const importers = readdirSync('src', { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|tsx|astro|js|mjs)$/.test(f))
      .filter((f) => /from '[^']*\/data-build'/.test(read(`src/${f}`)));
    expect(importers).toEqual(['lib/pantau-props.ts']);
  });
});

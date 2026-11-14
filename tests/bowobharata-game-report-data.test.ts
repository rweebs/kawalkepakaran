import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARVAS } from '../src/lib/bowobharata';
import { kategoriKey, tahapan, type Perkara, type Terlapor, type TerlaporKronologi } from '../src/lib/perkara';
import { buildGraph } from '../src/lib/relasi';
import { buildChapters, type Chapter, type SanjayaEntry } from '../src/lib/bowobharata-game/record';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { EMPTY_FOMO, EMPTY_SITE, reportData, summaryOf } from '../src/lib/bowobharata-game/report-build';
import type { Count, MapLinkKind } from '../src/lib/bowobharata-game/report-types';

const p = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const chapters = buildChapters(PARVAS, p.terlapor);
const g = gameData(p);
const r = g.report;
const nonE = p.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
const byId = new Map(p.terlapor.map((t) => [t.id, t]));
const LAST = chapters.length - 1;

describe('report: per-chapter counts', () => {
  it('has fresh, names and again as measured', () => {
    expect(r.chapters.map((c) => c.fresh)).toEqual([42, 5, 0, 2, 3, 0, 0, 0, 0, 25]);
    expect(r.fresh).toEqual([42, 5, 0, 2, 3, 0, 0, 0, 0, 25]);
    expect(r.fresh.reduce((a, b) => a + b, 0)).toBe(g.totals.people);
    expect(r.chapters.map((c) => c.names)).toEqual([42, 17, 12, 14, 8, 5, 0, 0, 0, 25]);
    r.chapters.forEach((c) => expect(c.again).toBe(c.names - c.fresh));
  });
  it('counts acts and replies from the entries rows', () => {
    chapters.forEach((c, i) => {
      expect(r.chapters[i].acts + r.chapters[i].replies).toBe(c.entries.reduce((n, e) => n + e.rows.length, 0));
    });
    expect(r.chapters.map((c) => c.acts + c.replies)).toEqual([81, 18, 12, 15, 10, 5, 0, 0, 0, 44]);
    expect([r.chapters[0].acts, r.chapters[0].replies]).toEqual([81, 0]);
    expect([r.chapters[1].acts, r.chapters[1].replies]).toEqual([17, 1]);
  });
  it('counts the distinct police reports of each chapter', () => {
    chapters.forEach((c, i) => expect(r.chapters[i].reports).toBe(new Set(c.entries.flatMap((e) => e.laporan)).size));
  });
});

describe('report: bins', () => {
  it('uses day bins for parvas and month bins for the prologue and the finale', () => {
    r.chapters.forEach((c, i) => expect(c.unit).toBe(i >= 1 && i <= PARVAS.length ? 'day' : 'month'));
    expect(r.chapters[0].unit).toBe('month');
    expect(r.chapters[9].unit).toBe('month');
    expect(r.chapters[1].unit).toBe('day');
    expect(r.chapters[8].unit).toBe('day');
  });
  it('gives parva 1 one bin per day of its window', () => {
    const keys = r.chapters[1].bins.map((b) => b.key);
    expect(keys).toEqual(['2026-04-26', '2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']);
  });
  it('accounts for every row in the bins or in undated', () => {
    r.chapters.forEach((c) => expect(c.bins.reduce((n, b) => n + b.n, 0) + c.undated).toBe(c.acts + c.replies));
  });
  it('leaves chapters 6 to 8 empty', () => {
    for (const i of [6, 7, 8]) expect(r.chapters[i]).toMatchObject({ bins: [], undated: 0 });
  });
  it('keeps every month of a month axis, with no gap', () => {
    for (const i of [0, 9]) {
      const keys = r.chapters[i].bins.map((b) => b.key);
      keys.slice(1).forEach((k, j) => {
        const [y, m] = keys[j].split('-').map(Number);
        expect(k).toBe(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7));
      });
    }
  });
});

describe('report: the whole record over time', () => {
  it('has consecutive months from span.from to span.to', () => {
    expect(r.span.from.endsWith('-01')).toBe(true);
    expect(r.months[0].key).toBe(r.span.from.slice(0, 7));
    expect(r.months[r.months.length - 1].key).toBe(r.span.to.slice(0, 7));
    r.months.slice(1).forEach((b, j) => {
      const [y, m] = r.months[j].key.split('-').map(Number);
      expect(b.key).toBe(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7));
    });
  });
  it('accounts for every counted row', () => {
    expect(r.months.reduce((n, b) => n + b.n, 0) + r.undated).toBe(g.totals.events);
    expect(g.totals.events).toBe(187);
  });
  it('ends on or after the last window', () => {
    expect(r.windows).toHaveLength(PARVAS.length);
    expect(r.span.to >= r.windows[r.windows.length - 1].to).toBe(true);
  });
});

describe('report: pasal and stages', () => {
  const ordered = (list: Count[]) => list.every((c, i) => i === 0 || list[i - 1].n > c.n || (list[i - 1].n === c.n && list[i - 1].label < c.label));
  it('orders every pasal list by count, then by label in code-point order', () => {
    r.chapters.forEach((c) => expect(ordered(c.pasal)).toBe(true));
    expect(ordered(r.pasal)).toBe(true);
    expect(r.pasal.length).toBeGreaterThan(1);
  });
  it('never counts more names than a chapter has', () => {
    r.chapters.forEach((c) => c.pasal.forEach((x) => expect(x.n).toBeLessThanOrEqual(c.names)));
  });
  it('counts the terlapor citing a pasal over the whole record', () => {
    expect(r.pasal.find((x) => x.label === '433 KUHP')?.n).toBe(nonE.filter((t) => t.pasal.includes('433 KUHP')).length);
  });
  it('matches tahapan recomputed, per chapter and overall', () => {
    chapters.forEach((c, i) => expect(r.chapters[i].stages).toEqual(tahapan(c.entries.map((e) => byId.get(e.id)!), p.laporan)));
    expect(r.stages).toEqual(tahapan(nonE, p.laporan));
  });
});

describe('report: police reports', () => {
  it('lists 17, 13 by the Pelapor and 4 against, dated ones ascending', () => {
    expect(r.reports).toHaveLength(17);
    expect(r.reports.filter((x) => x.dir === 'by')).toHaveLength(13);
    expect(r.reports.filter((x) => x.dir === 'against')).toHaveLength(4);
    const dated = r.reports.filter((x) => x.date !== null).map((x) => x.date as string);
    expect(dated).toEqual([...dated].sort());
    const firstUndated = r.reports.findIndex((x) => x.date === null);
    if (firstUndated >= 0) expect(r.reports.slice(firstUndated).every((x) => x.date === null)).toBe(true);
  });
});

describe('report: the map', () => {
  const m = r.map;
  const full = buildGraph(EMPTY_SITE, p, EMPTY_FOMO, []);
  const graphById = new Map(full.nodes.map((n) => [n.id, n]));
  const kinds: MapLinkKind[] = ['in-allegation', 'out-response', 'against', 'member'];

  it('leaves category E out', () => {
    expect(m.nodes.some((n) => n.id === 'pk:E')).toBe(false);
    for (const t of p.terlapor.filter((x) => kategoriKey(x.kategori) === 'E')) expect(m.nodes.some((n) => n.id === `tl:${t.id}`)).toBe(false);
    const cats = new Set(nonE.map((t) => kategoriKey(t.kategori))).size;
    expect(m.nodes).toHaveLength(1 + 2 + cats + 77 + 2 + 17);
  });
  it('mirrors the /pantau graph nodes', () => {
    for (const n of m.nodes) {
      const src = graphById.get(n.id)!;
      expect({ id: n.id, label: n.label, kind: n.kind, source: n.source }).toEqual({ id: src.id, label: src.label, kind: src.kind, source: src.source });
    }
  });
  it('has well-formed links with the later chapter of their ends', () => {
    expect(m.links.length).toBeGreaterThan(0);
    for (const l of m.links) {
      expect(l.a).toBeGreaterThanOrEqual(0);
      expect(l.a).toBeLessThan(m.nodes.length);
      expect(l.b).toBeGreaterThanOrEqual(0);
      expect(l.b).toBeLessThan(m.nodes.length);
      expect(kinds).toContain(l.kind);
      expect(l.chapter).toBe(Math.max(m.nodes[l.a].chapter, m.nodes[l.b].chapter));
    }
  });
  it('puts each terlapor in the chapter of its full entry', () => {
    chapters.forEach((c, i) => {
      for (const e of c.entries.filter((x) => x.full)) expect(m.nodes.find((n) => n.id === `tl:${e.id}`)!.chapter).toBe(i);
    });
  });
  it('puts each report in the chapter of the first terlapor it links to, else the last', () => {
    const chapterOf = new Map(m.nodes.map((n) => [n.id, n.chapter]));
    for (const l of p.laporan) {
      const linked = l.terlapor.filter((id) => chapterOf.has(`tl:${id}`)).map((id) => chapterOf.get(`tl:${id}`)!);
      expect(chapterOf.get(`lp:${l.no}`)).toBe(linked.length ? Math.min(...linked) : LAST);
    }
    for (const n of m.nodes.filter((x) => x.kind === 'cluster' && x.source === 'perkara')) {
      const members = m.nodes.filter((x) => graphById.get(x.id)?.parent === n.id).map((x) => x.chapter);
      expect(n.chapter).toBe(Math.min(...members));
    }
  });
  it('rounds positions and radius to 0.01', () => {
    expect(m.pos).toHaveLength(3 * m.nodes.length);
    for (const v of [...m.pos, m.radius]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.round(v * 100) / 100).toBe(v);
    }
  });
  it('is the same on two builds', () => {
    expect(gameData(p).report).toEqual(r);
  });
});

describe('report: summaries', () => {
  it('gives every card a short non-empty summary in both locales', () => {
    const cards = g.events.flat();
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) for (const l of ['id', 'en'] as const) {
      expect(c.summary[l].length).toBeGreaterThan(0);
      expect(c.summary[l].length).toBeLessThanOrEqual(280);
    }
  });
  it('cuts a long paragraph at a space and ends with an ellipsis', () => {
    const s = summaryOf(['a '.repeat(200)]);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(280);
    expect(summaryOf(['  short  ', 'second'])).toBe('short');
  });
});

describe('report: size', () => {
  it('stays under 60,000 characters of JSON', () => {
    expect(JSON.stringify(r).length).toBeLessThan(60000);
  });
});

describe('report: synthetic records', () => {
  const row = (iso: string, precision: TerlaporKronologi['precision'], jenis = 'Perbuatan'): TerlaporKronologi => ({ tanggal: iso, iso, precision, peristiwa: 'x', jenis });
  const terlapor = (id: string, rows: TerlaporKronologi[]): Terlapor => ({
    id, nama: id, kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: null, dugaan: '', pasal: [], pasalUraian: [],
    somasi: [], aduan: '', laporan: [], kronologis: rows, catatan: [], dokumen: [],
  });
  const entry = (t: Terlapor): SanjayaEntry => ({ id: t.id, nama: t.nama, kategori: t.kategori, klaster: null, dugaan: '', pasal: [], laporan: [], rows: t.kronologis, full: true });
  const build = (rows: TerlaporKronologi[], chapterIndex: number, window: { from: string; to: string } | null) => {
    const t = terlapor('T-1', rows);
    const perkara = { terlapor: [t], laporan: [] } as unknown as Perkara;
    const cs: Chapter[] = chapters.map((c, i) => ({ id: c.id, window: i === chapterIndex ? window : c.window, entries: i === chapterIndex ? [entry(t)] : [] }));
    return reportData(perkara, cs);
  };
  const win = { from: '2026-04-26', to: '2026-04-28' };

  it('sends month and year rows to undated on a day axis, and drops a day row outside the window', () => {
    const c = build([row('2026-04-27', 'day'), row('2026-04', 'month'), row('2026', 'year'), row('2026-05-09', 'day')], 1, win).chapters[1];
    expect(c.bins).toEqual([{ key: '2026-04-26', n: 0 }, { key: '2026-04-27', n: 1 }, { key: '2026-04-28', n: 0 }]);
    expect(c.undated).toBe(2);
  });
  it('sends year rows to undated on a month axis', () => {
    const c = build([row('2026-03-05', 'day'), row('2026-05', 'month'), row('2025', 'year')], 0, null).chapters[0];
    expect(c.bins).toEqual([{ key: '2026-03', n: 1 }, { key: '2026-04', n: 0 }, { key: '2026-05', n: 1 }]);
    expect(c.undated).toBe(1);
  });
  it('ends the span on the last day of a month row dated after the last window', () => {
    const rep = build([row('2099-02', 'month')], 9, null);
    expect(rep.span.to).toBe('2099-02-28');
    expect(rep.months[rep.months.length - 1]).toEqual({ key: '2099-02', n: 1 });
  });
  it('falls back to the first window when no row is dated to a day or month', () => {
    const rep = build([row('2026', 'year')], 9, null);
    expect(rep.span.from).toBe(rep.windows[0].from);
    expect(rep.span.from).not.toContain('undefined');
    expect(rep.span.to).toBe(rep.windows[rep.windows.length - 1].to);
    expect(rep.months.length).toBeGreaterThan(0);
    expect(rep.months.every((b) => b.n === 0)).toBe(true);
    expect(rep.undated).toBe(1);
    const empty = reportData({ terlapor: [], laporan: [] } as unknown as Perkara, chapters.map((c) => ({ ...c, entries: [] })));
    expect(empty.span.from).toBe(empty.windows[0].from);
    expect(empty.months.length).toBeGreaterThan(0);
  });
});

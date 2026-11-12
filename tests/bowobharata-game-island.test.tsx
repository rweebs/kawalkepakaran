import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { FRAMING, PARVAS } from '../src/lib/bowobharata';
import { FRAMING_EN } from '../src/lib/bowobharata-en';
import { kategoriKey, type Perkara } from '../src/lib/perkara';
import { buildChapters, finaleTotals } from '../src/lib/bowobharata-game/record';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { initFlow, reduce, readSaved, writeSaved, type FlowState } from '../src/lib/bowobharata-game/flow';
import { Gate, Intro, SanjayaReport, CatchCard, Finale, Hud, Lost, Paused, FallbackPlay, catchItems } from '../src/components/bowobharata-game/screens';
import BowobharataGame from '../src/components/BowobharataGame';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const chapters = buildChapters(PARVAS, data.terlapor);
const totals = finaleTotals(data);
const COUNT = chapters.length;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const nonE = data.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
/** Each category E person by full name, by the name before the parentheses, and by the name inside them (e.g. "Abil Sudarman"). */
const eNames = data.terlapor.filter((t) => kategoriKey(t.kategori) === 'E').flatMap((t) => {
  const inner = t.nama.match(/\(([^)]+)\)/)?.[1];
  return [t.nama, t.nama.split(' (')[0], ...(inner ? [inner] : [])];
});
const noop = () => {};

/** Character ranges of every element carrying data-entry (article or li, never nested in its own kind). */
function entryRanges(html: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of html.matchAll(/<(article|li)[^>]*data-entry="[^"]*"[^>]*>[\s\S]*?<\/\1>/g)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}
/** Every occurrence of every non-E terlapor name sits inside an entry element that carries the allegation line. */
function expectFramedNames(html: string, locale: 'id' | 'en') {
  const ranges = entryRanges(html);
  for (const [a, b] of ranges) {
    const block = html.slice(a, b);
    expect(block).toContain(esc(GAME_COPY[locale].allegation));
    expect(block).toContain(locale === 'id' ? 'href="/hak-jawab"' : 'href="/en/right-of-reply"');
  }
  let seen = 0;
  for (const t of nonE) {
    const name = esc(t.nama);
    for (let i = html.indexOf(name); i !== -1; i = html.indexOf(name, i + 1)) {
      seen++;
      expect(ranges.some(([a, b]) => i >= a && i < b), `${t.nama} outside an entry`).toBe(true);
    }
  }
  return seen;
}

const sanjaya = (i: number, locale: 'id' | 'en' = 'id') =>
  renderToString(<SanjayaReport locale={locale} chapterIndex={i} chapter={chapters[i]} onNext={noop} />);

describe('flow reducer', () => {
  const at = (s: Partial<FlowState>): FlowState => ({ ...initFlow(COUNT, {}), ...s });

  it('walks gate → intro → play → sanjaya → next intro', () => {
    let s = initFlow(COUNT, {});
    expect(s.screen).toBe('gate');
    s = reduce(s, { type: 'start' });
    expect(s).toMatchObject({ screen: 'intro', chapter: 0 });
    s = reduce(s, { type: 'next' });
    expect(s.screen).toBe('play');
    s = reduce(s, { type: 'playResult', result: 'won', score: 300 });
    expect(s).toMatchObject({ screen: 'sanjaya', best: 300 });
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'intro', chapter: 1 });
  });

  it('a lost chapter shows lost, and retry replays the same chapter', () => {
    let s = reduce(at({ screen: 'play', chapter: 4 }), { type: 'playResult', result: 'lost', score: 0 });
    expect(s).toMatchObject({ screen: 'lost', chapter: 4 });
    s = reduce(s, { type: 'retry' });
    expect(s).toMatchObject({ screen: 'play', chapter: 4 });
  });

  it('the finale has no play: intro → Sanjaya → finale', () => {
    let s = reduce(at({ screen: 'sanjaya', chapter: COUNT - 2 }), { type: 'next' });
    expect(s).toMatchObject({ screen: 'intro', chapter: COUNT - 1 });
    s = reduce(s, { type: 'next' });
    expect(s.screen).toBe('sanjaya');
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'finale', chapter: COUNT - 1 });
  });

  it('context loss switches to the fallback at the current chapter and screen', () => {
    const s = reduce(at({ screen: 'play', chapter: 5, mode: '3d' }), { type: 'contextLost' });
    expect(s).toMatchObject({ screen: 'play', chapter: 5, mode: 'fallback' });
    expect(initFlow(COUNT, { fallback: true }).mode).toBe('fallback');
  });

  it('a hidden tab pauses, and becoming visible does not resume on its own', () => {
    let s = reduce(at({ screen: 'play' }), { type: 'hidden' });
    expect(s.paused).toBe(true);
    s = reduce(s, { type: 'visible' });
    expect(s.paused).toBe(true);
    s = reduce(s, { type: 'togglePause' });
    expect(s.paused).toBe(false);
  });

  it('restores a saved chapter only at the gate, clamped', () => {
    expect(reduce(initFlow(COUNT, {}), { type: 'restore', chapter: 3, best: 900 })).toMatchObject({ chapter: 3, best: 900 });
    expect(reduce(initFlow(COUNT, {}), { type: 'restore', chapter: 99, best: 0 }).chapter).toBe(COUNT - 1);
    expect(reduce(at({ screen: 'play', chapter: 1 }), { type: 'restore', chapter: 3, best: 0 }).chapter).toBe(1);
  });

  it('saves { best, chapter } under bowobharata-game, and survives a throwing storage', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage;
    writeSaved(store, { best: 400, chapter: 2 });
    expect(JSON.parse(mem.get('bowobharata-game')!)).toEqual({ best: 400, chapter: 2 });
    expect(readSaved(store)).toEqual({ best: 400, chapter: 2 });
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(readSaved(broken)).toBeNull();
    expect(() => writeSaved(broken, { best: 1, chapter: 1 })).not.toThrow();
    expect(readSaved(undefined)).toBeNull();
  });
});

describe('gate', () => {
  for (const locale of ['id', 'en'] as const) {
    it(`${locale}: shows FRAMING before any terlapor name, and the start button`, () => {
      const html = renderToString(<Gate locale={locale} fallback={false} onStart={noop} />);
      const framing = locale === 'id' ? FRAMING : FRAMING_EN;
      const first = html.indexOf(esc(framing[0]));
      expect(first).toBeGreaterThan(-1);
      for (const p of framing) expect(html).toContain(esc(p));
      for (const t of nonE) {
        const i = html.indexOf(esc(t.nama));
        if (i !== -1) expect(i).toBeGreaterThan(first);
      }
      expect(html).toContain(esc(GAME_COPY[locale].gateStart));
    });

    it(`${locale}: "Sengkuni" appears only inside Abil Sudarman's labelled poster`, () => {
      const html = renderToString(<Gate locale={locale} fallback={false} onStart={noop} />);
      const fig = html.match(/<figure[^>]*data-poster="sengkuni"[^>]*>[\s\S]*?<\/figure>/);
      expect(fig).not.toBeNull();
      expect(fig![0]).toContain('Abil Sudarman');
      const rest = html.replace(fig![0], '');
      expect(rest).not.toMatch(/Sengkuni/);
    });
  }

  it('the island renders the gate first, without any terlapor name or dossier entry', () => {
    const html = renderToString(<BowobharataGame locale="id" forceFallback />);
    expect(html).toContain(esc(FRAMING[0]));
    expect(html).not.toContain('data-entry');
    for (const t of nonE) expect(html).not.toContain(esc(t.nama));
  });

  it('the fallback gate says it is the version without animation', () => {
    expect(renderToString(<Gate locale="id" fallback onStart={noop} />)).toContain(esc(GAME_COPY.id.fallbackNote));
  });
});

describe("Sanjaya's report", () => {
  it('every rendered name sits in an entry with the allegation line and the reply link, in every chapter', () => {
    let seen = 0;
    for (let i = 0; i < COUNT; i++) seen += expectFramedNames(sanjaya(i), 'id');
    expect(seen).toBeGreaterThanOrEqual(nonE.length);
  });

  it('shows the dossier fields of a full entry', () => {
    const html = sanjaya(0);
    const e = chapters[0].entries.find((x) => x.full)!;
    expect(html).toContain(esc(e.nama));
    expect(html).toContain(esc(e.dugaan));
    for (const f of Object.values(GAME_COPY.id.fields)) expect(html).toContain(esc(f));
  });

  it('lists name-only entries under nameOnly', () => {
    const i = chapters.findIndex((c) => c.entries.some((e) => !e.full));
    expect(i).toBeGreaterThan(-1);
    expect(sanjaya(i)).toContain(esc(GAME_COPY.id.nameOnly));
  });

  it('a chapter without entries says sanjayaNone', () => {
    const empty = chapters.findIndex((c) => c.entries.length === 0);
    expect(empty).toBeGreaterThan(-1);
    expect(sanjaya(empty)).toContain(esc(GAME_COPY.id.sanjayaNone));
  });

  it('no category E name renders on any Sanjaya screen, prologue card, intro or the finale; Sengkuni never leaves the gate', () => {
    // Whitelist, by ruling: the gate and the pause screen (FRAMING and the labelled poster) and the event catch cards
    // (linimasa titles, each under the allegation line) may contain these names. Everything else must not.
    const checked: string[] = [];
    const screens: string[] = [];
    for (const locale of ['id', 'en'] as const) {
      for (let i = 0; i < COUNT; i++) {
        checked.push(sanjaya(i, locale));
        checked.push(renderToString(<Intro locale={locale} chapterIndex={i} onNext={noop} />));
        const items = catchItems(i, chapters, locale);
        for (const it of items) {
          const html = renderToString(<CatchCard locale={locale} item={it} />);
          (it.kind === 'entry' ? checked : screens).push(html);
        }
      }
      checked.push(renderToString(<Finale locale={locale} totals={totals} onAgain={noop} />));
      checked.push(renderToString(<Lost locale={locale} onRetry={noop} />));
      checked.push(renderToString(<Hud locale={locale} caught={1} missed={0} decoys={0} sight={false} paused={false} onPause={noop} />));
      screens.push(renderToString(<Paused locale={locale} onResume={noop} />));
    }
    const strict = checked.join('\n');
    expect(eNames).toContain('Abil Sudarman');
    for (const n of eNames) expect(strict, n).not.toContain(esc(n));
    const all = [strict, ...screens].join('\n');
    // The only "Sengkuni" outside the gate is the epic's own episode line of parva 1, on its intro card, with no names.
    const intro1 = renderToString(<Intro locale="id" chapterIndex={1} onNext={noop} />);
    for (const t of nonE) expect(intro1).not.toContain(esc(t.nama));
    expect(all.split(/Sengkuni/).length - 1).toBe(2);
  });

  it('EN renders the EN allegation line and the EN reply link', () => {
    const html = sanjaya(0, 'en');
    expect(html).toContain(esc(GAME_COPY.en.allegation));
    expect(html).not.toContain(esc(GAME_COPY.id.allegation));
    expectFramedNames(html, 'en');
  });
});

describe('catch cards and the fallback play', () => {
  it('parva catches show date, title and channel and link to the event page', () => {
    const items = catchItems(1, chapters, 'id');
    expect(items.length).toBe(PARVAS[0].slugs.length);
    const html = renderToString(<CatchCard locale="id" item={items[0]} />);
    expect(html).toMatch(/href="\/kasus\/abil-sudarman\/linimasa\/[^"]+"/);
    expect(html).toContain(esc(GAME_COPY.id.catchSource));
    const en = renderToString(<CatchCard locale="en" item={catchItems(1, chapters, 'en')[0]} />);
    expect(en).toMatch(/href="\/en\/cases\/abil-sudarman\/timeline\/[^"]+"/);
  });

  it('every event catch card, every parva, ID and EN, carries the allegation line and the reply link', () => {
    let n = 0;
    for (const locale of ['id', 'en'] as const) {
      for (let i = 1; i <= PARVAS.length; i++) {
        const items = catchItems(i, chapters, locale);
        const fb = renderToString(<FallbackPlay locale={locale} items={items} taken={items.length} onTake={noop} onDone={noop} />);
        expect(fb.split(esc(GAME_COPY[locale].allegation)).length - 1).toBe(items.length);
        for (const it of items) {
          const html = renderToString(<CatchCard locale={locale} item={it} />);
          expect(html).toContain(esc(GAME_COPY[locale].allegation));
          expect(html).toContain(locale === 'id' ? 'href="/hak-jawab"' : 'href="/en/right-of-reply"');
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('prologue catches show each full entry earliest dated row, under the allegation frame', () => {
    const items = catchItems(0, chapters, 'id');
    expect(items.length).toBe(chapters[0].entries.filter((e) => e.full).length);
    for (const it of items) {
      expect(it.kind).toBe('entry');
      expectFramedNames(renderToString(<CatchCard locale="id" item={it} />), 'id');
    }
  });

  it('fallback play takes the chapter events in one by one', () => {
    const items = catchItems(1, chapters, 'id');
    const none = renderToString(<FallbackPlay locale="id" items={items} taken={0} onTake={noop} onDone={noop} />);
    expect(none).toContain(esc(GAME_COPY.id.actions.take));
    expect(none).not.toContain('data-catch');
    const one = renderToString(<FallbackPlay locale="id" items={items} taken={1} onTake={noop} onDone={noop} />);
    expect(one.match(/data-catch/g)).toHaveLength(1);
    const all = renderToString(<FallbackPlay locale="id" items={items} taken={items.length} onTake={noop} onDone={noop} />);
    expect(all).toContain(esc(GAME_COPY.id.actions.next));
    expect(all).not.toContain(esc(GAME_COPY.id.actions.take));
  });
});

describe('finale, pause and HUD', () => {
  it('shows reportsBy and reportsAgainst and links to /pantau', () => {
    const html = renderToString(<Finale locale="id" totals={totals} onAgain={noop} />);
    expect(html).toContain(`${totals.reportsBy} laporan dibuat Rahmat Wibowo, ${totals.reportsAgainst} laporan terhadapnya`);
    expect(html).toContain(`href="/pantau"`);
    expect(html).toContain(esc(GAME_COPY.id.finaleClose));
    expect(renderToString(<Finale locale="en" totals={totals} onAgain={noop} />)).toContain('href="/en/monitor"');
  });

  it('the pause screen keeps the framing in reach', () => {
    const html = renderToString(<Paused locale="id" onResume={noop} />);
    expect(html).toContain(esc(FRAMING[0]));
    expect(html).toContain(esc(GAME_COPY.id.actions.resume));
  });

  it('the HUD names its counts and has a pause button', () => {
    const html = renderToString(<Hud locale="en" caught={2} missed={1} decoys={0} sight paused={false} onPause={noop} />);
    for (const k of ['caught', 'missed', 'decoys', 'pause'] as const) expect(html).toContain(esc(GAME_COPY.en.hud[k]));
    expect(html).toContain('<button');
  });
});

describe('island wiring (source)', () => {
  const src = readFileSync('src/components/BowobharataGame.tsx', 'utf8');
  it('loads the scene dynamically as the game, and falls back on failure', () => {
    expect(src).toContain("import('../lib/bowobharata/KurukshetraScene')");
    expect(src).toMatch(/game: true/);
    expect(src).toMatch(/onLost:/);
    expect(src).toContain('prefers-reduced-motion: reduce');
    expect(src).toMatch(/fallback/);
  });
  it('uses the parva pose, the 28px pick radius and a 350ms long-press', () => {
    expect(src).toContain('PARVA_POSES[Math.min(');
    expect(src).toContain('PICK_RADIUS = 28');
    expect(src).toMatch(/pickNearest\([\s\S]*?PICK_RADIUS\)/);
    expect(src).toContain('350');
    expect(src).toContain('Math.min(MAX_PROLOGUE_ARROWS, Math.max(MIN_PROLOGUE_ARROWS');
    expect(src).toContain('MAX_PROLOGUE_ARROWS = 12');
  });
  it('restarts play once a new scene arrives, and never syncs a disposed layer', () => {
    expect(src).toMatch(/\[playing3d, ready,/);
    expect(src).toContain('setReady(0)');
    expect(src).toContain('layerRef.current === layer');
    expect(src).toContain('e.button === 0');
  });
  it('pauses when the tab is hidden', () => {
    expect(src).toContain('visibilitychange');
  });
});

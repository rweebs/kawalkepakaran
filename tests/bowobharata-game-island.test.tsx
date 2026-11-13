import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { FRAMING, PARVAS } from '../src/lib/bowobharata';
import { FRAMING_EN } from '../src/lib/bowobharata-en';
import { kategoriKey, type Perkara } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { CHAPTER_TYPES } from '../src/lib/bowobharata-game/missions';
import {
  Gate, Intro, SanjayaReport, CatchCard, Finale, Hud, Paused, DataError, FallbackPlay, FailCard, MissionCard, Recorded, cardView,
} from '../src/components/bowobharata-game/screens';
import BowobharataGame from '../src/components/BowobharataGame';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
/** The data the island receives: Sanjaya's chapters as ChapterView, the event cards and the prologue dates. */
const game = gameData(data);
const chapters = game.chapters;
const totals = game.totals;
const COUNT = chapters.length;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const nonE = data.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
/** Each category E person by full name, by the name before the parentheses, and by the name inside them (e.g. "Abil Sudarman"). */
const eNames = data.terlapor.filter((t) => kategoriKey(t.kategori) === 'E').flatMap((t) => {
  const inner = t.nama.match(/\(([^)]+)\)/)?.[1];
  return [t.nama, t.nama.split(' (')[0], ...(inner ? [inner] : [])];
});
const noop = () => {};
const settings = { assist: false, easy: false };
const paused = (locale: 'id' | 'en') =>
  renderToString(<Paused locale={locale} onResume={noop} settings={settings} onSettings={noop} onUseStill={noop} />);

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

  it('no category E name renders on any Sanjaya screen, intro, lakon card, prologue record, fail card or the finale; Sengkuni never leaves the gate', () => {
    // Whitelist, by ruling: the pause screen (FRAMING) and the event cards, alone or on a parva's Tercatat screen
    // (linimasa titles, each under the allegation line), may contain these names; they are still counted for "Sengkuni".
    // The gate stays out of the sweep: its own test keeps "Sengkuni" inside the labelled poster. Everything else must not.
    const checked: string[] = [];
    const screens: string[] = [];
    for (const locale of ['id', 'en'] as const) {
      for (let i = 0; i < COUNT; i++) {
        checked.push(sanjaya(i, locale));
        checked.push(renderToString(<Intro locale={locale} chapterIndex={i} onNext={noop} />));
        if (i < CHAPTER_TYPES.length) checked.push(renderToString(<MissionCard locale={locale} chapterIndex={i} type={CHAPTER_TYPES[i]} />));
        const cards = game.events[i];
        for (const card of cards) screens.push(renderToString(<CatchCard locale={locale} card={cardView(card, locale)} />));
        if (cards.length > 0) {
          screens.push(renderToString(<Recorded locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} whole onNext={noop} />));
        }
      }
      checked.push(renderToString(<Recorded locale={locale} chapterIndex={0} cards={game.events[0]} prologue={game.prologue} whole={false} onNext={noop} />));
      for (const reason of ['time', 'muddied'] as const) {
        checked.push(renderToString(<FailCard locale={locale} reason={reason} fails={2} assist={false} onRetry={noop} onSkip={noop} />));
      }
      checked.push(renderToString(<Finale locale={locale} totals={totals} onAgain={noop} />));
      screens.push(paused(locale));
    }
    // Per locale: Sanjaya ×10, Intro ×10, MissionCard ×9, Recorded (prologue), FailCard ×2 and the finale; then the
    // whitelisted 24 event cards, 8 Tercatat screens and the pause screen.
    expect(CHAPTER_TYPES).toHaveLength(COUNT - 1);
    expect(checked).toHaveLength(2 * (COUNT + COUNT + (COUNT - 1) + 1 + 2 + 1));
    expect(screens).toHaveLength(2 * (game.events.flat().length + PARVAS.length + 1));
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
    const cards = game.events[1];
    expect(cards.length).toBe(PARVAS[0].slugs.length);
    const html = renderToString(<CatchCard locale="id" card={cardView(cards[0], 'id')} />);
    expect(html).toMatch(/href="\/kasus\/abil-sudarman\/linimasa\/[^"]+"/);
    expect(html).toContain(esc(GAME_COPY.id.catchSource));
    for (const s of [cards[0].dateLabel.id, cards[0].title.id, cards[0].channel.id]) expect(html).toContain(esc(s));
    const en = renderToString(<CatchCard locale="en" card={cardView(cards[0], 'en')} />);
    expect(en).toMatch(/href="\/en\/cases\/abil-sudarman\/timeline\/[^"]+"/);
    for (const s of [cards[0].dateLabel.en, cards[0].title.en, cards[0].channel.en]) expect(en).toContain(esc(s));
  });

  it('every event card, every parva, ID and EN, carries the allegation line and the reply link, on Tercatat and in the fallback', () => {
    let n = 0;
    for (const locale of ['id', 'en'] as const) {
      const allegation = esc(GAME_COPY[locale].allegation);
      const reply = locale === 'id' ? 'href="/hak-jawab"' : 'href="/en/right-of-reply"';
      for (let i = 1; i <= PARVAS.length; i++) {
        const cards = game.events[i];
        expect(cards.length).toBeGreaterThan(0);
        const recorded = renderToString(<Recorded locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} whole onNext={noop} />);
        const fb = renderToString(<FallbackPlay locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} taken={cards.length} onTake={noop} onDone={noop} />);
        for (const html of [recorded, fb]) {
          expect(html.split(allegation).length - 1).toBe(cards.length);
          const shown = [...html.matchAll(/<article[^>]*data-catch[^>]*>[\s\S]*?<\/article>/g)].map((m) => m[0]);
          expect(shown).toHaveLength(cards.length);
          for (const b of shown) {
            expect(b).toContain(allegation);
            expect(b).toContain(reply);
          }
        }
        for (const card of cards) {
          const html = renderToString(<CatchCard locale={locale} card={cardView(card, locale)} />);
          expect(html).toContain(allegation);
          expect(html).toContain(reply);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('fallback play takes the chapter events in one by one', () => {
    const cards = game.events[1];
    const fb = (taken: number) =>
      renderToString(<FallbackPlay locale="id" chapterIndex={1} cards={cards} prologue={game.prologue} taken={taken} onTake={noop} onDone={noop} />);
    const none = fb(0);
    expect(none).toContain(esc(GAME_COPY.id.actions.take));
    expect(none).not.toContain('data-catch');
    expect(fb(1).match(/data-catch/g)).toHaveLength(1);
    const all = fb(cards.length);
    expect(all.match(/data-catch/g)).toHaveLength(cards.length);
    expect(all).toContain(esc(GAME_COPY.id.actions.next));
    expect(all).not.toContain(esc(GAME_COPY.id.actions.take));
  });

  it('the fallback prologue is one step that shows the framed dates, and no name', () => {
    for (const locale of ['id', 'en'] as const) {
      const c = GAME_COPY[locale];
      const fb = (taken: number) =>
        renderToString(<FallbackPlay locale={locale} chapterIndex={0} cards={game.events[0]} prologue={game.prologue} taken={taken} onTake={noop} onDone={noop} />);
      const before = fb(0);
      expect(before).toContain(esc(c.actions.take));
      expect(before).not.toContain('prologue-dates');
      expect(before).not.toMatch(/<time\b/);
      const after = fb(1);
      expect(after).toContain(esc(c.recordedScreen.prologue({ n: game.prologue.length })));
      const framed = [...after.matchAll(/<section[^>]*data-entry="prologue-dates"[^>]*>[\s\S]*?<\/section>/g)].map((m) => m[0]);
      expect(framed).toHaveLength(1);
      expect(framed[0].match(/<time\b/g)).toHaveLength(game.prologue.length);
      expect(after.match(/<time\b/g)).toHaveLength(game.prologue.length);
      expect(framed[0]).toContain(esc(c.allegation));
      expect(framed[0]).toContain(locale === 'id' ? 'href="/hak-jawab"' : 'href="/en/right-of-reply"');
      expect(after).toContain(esc(c.actions.next));
      expect(after).not.toContain(esc(c.actions.take));
      expect(after).not.toContain('data-catch');
      for (const t of data.terlapor) expect(after).not.toContain(esc(t.nama));
    }
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

  it('the finale closing line sits in an entry with the allegation line and the reply link', () => {
    for (const locale of ['id', 'en'] as const) {
      const html = renderToString(<Finale locale={locale} totals={totals} onAgain={noop} />);
      const close = html.match(/<article[^>]*data-entry="finale-close"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? '';
      expect(close).toContain(esc(GAME_COPY[locale].finaleClose));
      expectFramedNames(html, locale);
      expect(entryRanges(html)).toHaveLength(1);
    }
  });

  it('the pause screen keeps the framing in reach', () => {
    const html = paused('id');
    expect(html).toContain(esc(FRAMING[0]));
    expect(html).toContain(esc(GAME_COPY.id.actions.resume));
    for (const s of [GAME_COPY.id.armyNote, GAME_COPY.id.pelaporNote]) expect(html).toContain(esc(s));
    expect(html).toContain('href="/hak-jawab"');
    expect(paused('en')).toContain(esc(FRAMING_EN[0]));
    expect(paused('en')).toContain('href="/en/right-of-reply"');
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

describe('data error screen', () => {
  it('shows the message and a retry button in both locales', () => {
    for (const l of ['id', 'en'] as const) {
      const html = renderToString(<DataError locale={l} onRetry={noop} />);
      expect(html).toContain(esc(GAME_COPY[l].dataError.message));
      expect(html).toContain(esc(GAME_COPY[l].dataError.retry));
      expect(html).toContain('role="alert"');
    }
  });
});

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { FRAMING, PARVAS } from '../src/lib/bowobharata';
import { FRAMING_EN } from '../src/lib/bowobharata-en';
import { kategoriKey, type Perkara } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { CHAPTER_TYPES } from '../src/lib/bowobharata-game/missions';
import {
  Gate, Intro, SanjayaReport, CatchCard, Finale, Paused, DataError, FallbackPlay, FailCard, MissionCard, Recorded, TouchControls, cardView,
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
      checked.push(renderToString(<TouchControls locale={locale} manual onChange={noop} surge={{ ready: true, frac: 1 }} sight={{ on: false, charge: 0 }} />));
      screens.push(paused(locale));
    }
    // Per locale: Sanjaya ×10, Intro ×10, MissionCard ×9, Recorded (prologue), FailCard ×2, the finale and TouchControls; then the
    // whitelisted 24 event cards, 8 Tercatat screens and the pause screen.
    expect(CHAPTER_TYPES).toHaveLength(COUNT - 1);
    expect(checked).toHaveLength(2 * (COUNT + COUNT + (COUNT - 1) + 1 + 2 + 1 + 1));
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

describe('finale and pause', () => {
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
});

describe('island wiring (source)', () => {
  const src = readFileSync('src/components/BowobharataGame.tsx', 'utf8');
  /** The argument text of every call to `name`, read up to its matching parenthesis. */
  const callArgs = (name: string): string[] =>
    [...src.matchAll(new RegExp(`\\b${name}\\(`, 'g'))].map((m) => {
      let depth = 1;
      let i = m.index! + m[0].length;
      const from = i;
      for (; i < src.length && depth > 0; i++) depth += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
      return src.slice(from, i - 1);
    });

  it('loads the scene dynamically as the game, and falls back on failure', () => {
    expect(src).toContain("import('../lib/bowobharata/KurukshetraScene')");
    expect(src).toMatch(/game: true/);
    expect(src).toMatch(/onLost:/);
    expect(src).toContain('prefers-reduced-motion: reduce');
    expect(src).toMatch(/fallback/);
  });

  it('loads the runtime with the scene and wires the keyboard, the device, the cinema and the slow-device offer', () => {
    for (const s of [
      "import('../lib/bowobharata-game/world/runtime')", 'createRuntime(', '(pointer: coarse)', 'e.code', "'blur'",
      'document.fullscreenEnabled', "'introStart'", "'introEnd'", 'data-cine', 'data-play', 'onSlow', 'SlowPrompt', 'useFallback',
    ]) {
      expect(src, s).toContain(s);
    }
    // Both modules load together, and the runtime is built on the scene just made.
    expect(src).toMatch(/Promise\.all\(\[\s*import\('\.\.\/lib\/bowobharata\/KurukshetraScene'\),\s*import\('\.\.\/lib\/bowobharata-game\/world\/runtime'\),\s*\]\)/);
    expect(src).toContain('createRuntime(scene, {');
  });

  it('a runtime error falls back to the version without animation: onError dispatches contextLost', () => {
    expect(src).toMatch(/onError: \(\) => dispatch\(\{ type: 'contextLost' \}\)/);
  });

  it('never stores the settings: no writeSaved( call passes them', () => {
    const calls = callArgs('writeSaved');
    expect(calls).toHaveLength(2);
    for (const args of calls) expect(args).not.toMatch(/settings/i);
  });

  it('the tap game is gone: no pick, wave, catch, pose or linimasa import', () => {
    for (const s of ['pickNearest', 'PARVA_POSES', 'buildWave(', 'catchArrow(', 'catchItems(', 'linimasa-locale', 'parvaEvents(']) {
      expect(src, s).not.toContain(s);
    }
  });

  it('drives the runtime by screen: orbit on the intro, start (or retry after a fail) on play, the finale on the finale', () => {
    expect(src).toContain("if (flow.screen === 'intro') rt.orbit();");
    expect(src).toContain("else if (flow.screen === 'finale') rt.finale();");
    // A retry only on the runtime that failed: a new one has no checkpoint, so it starts the chapter afresh.
    expect(src).toContain("const fromLost = last.rt === rt && last.screen === 'lost';");
    expect(src).toMatch(/if \(fromLost\) rt\.retry\(\);\s*else rt\.start\(flow\.chapter, \(data\.events\[flow\.chapter\] \?\? \[\]\)\.map\(\(e\) => e\.slug\), seed\);/);
    // Each command once per screen and runtime: a new runtime (ready) or the data arriving does not start a chapter twice.
    expect(src).toMatch(/\}, \[flow\.screen, flow\.chapter, flow\.mode, ready, data\]\);/);
    expect(src).toContain('last.rt === rt && last.screen === flow.screen && last.chapter === flow.chapter');
  });

  it('stills the scene on Tercatat, Sanjaya and the fail card, and while paused', () => {
    expect(src).toContain("const STILL_SCREENS: readonly Screen[] = ['recorded', 'sanjaya', 'lost'];");
    expect(src).toContain('sceneRef.current?.setPaused(flow.paused || STILL_SCREENS.includes(flow.screen));');
  });

  it('ends the play from the events: done wins with its score, a fail loses after the fail shot', () => {
    expect(src).toMatch(/case 'done':\s*dispatch\(\{ type: 'playResult', result: 'won', score: e\.score \}\);/);
    // The loss is timed on the game's clock (which a pause stops), not on a wall-clock timer.
    expect(src).toMatch(/case 'failed':[\s\S]{0,200}?setFailReason\(e\.reason\);\s*failClock\.current = runtimeRef\.current\?\.state\(\)\?\.clock \?\? null;/);
    expect(src).toMatch(/failClock\.current !== null[\s\S]{0,120}?failShotDone\(clock, failClock\.current, MISSION_TIMING\.failSeconds\)[\s\S]{0,120}?failClock\.current = null;\s*dispatch\(\{ type: 'playResult', result: 'lost', score: 0 \}\)/);
    expect(src).not.toMatch(/result: 'lost'[^;]*failSeconds \* 1000/);
    // A new play (start or retry) and the skip forget the remembered fail clock.
    expect(src).toMatch(/const resetPlay = \(\) => \{[\s\S]*?failClock\.current = null;/);
    expect(src).toMatch(/onSkip=\{\(\) => \{ failClock\.current = null;/);
  });

  it('shows the lakon card and the cinema on introStart and on a chapter that starts in its intro; introEnd hides both; outroStart brings the bars back', () => {
    expect(src).toMatch(/case 'introStart':\s*showMission\(\);/);
    expect(src).toMatch(/case 'introEnd':\s*hideMission\(\);/);
    expect(src).toMatch(/case 'outroStart':\s*setCine\(true\);/);
    // The prologue begins in its intro, so no introStart comes for it: its first HUD snapshot opens the card instead.
    expect(src).toMatch(/if \(first\.current\) \{\s*first\.current = false;\s*if \(h\.phase === 'intro'\) showMission\(\);/);
    expect(src).toMatch(/<MissionCard locale=\{locale\} chapterIndex=\{flow\.chapter\} type=\{hud\.type\} \/>/);
    // The gunungan wipe: in at the intro's start, out shortly after.
    expect(src).toContain('<div className="bg-wipe" aria-hidden="true" />');
    // One attribute change per transition ('a' and 'b' alternate so the CSS animation restarts): no second flip.
    expect(src).toMatch(/setWipe\(\(w\) => \(w === 'a' \? 'b' : 'a'\)\);/);
    expect(src).not.toContain('WIPE_HOLD_MS');
    expect(src).not.toContain("setWipe('out')");
    expect(src).toMatch(/data-cine=\{playing3d && cine \? 'on' : undefined\}/);
    expect(src).toMatch(/data-play=\{playing3d \? 'on' : undefined\}/);
  });

  it('turns the six toast events into at most two toasts of 4 s each, through toastText', () => {
    expect(src).toContain("new Set<GameEvent['type']>(['recorded', 'filed', 'rewriteTaken', 'held', 'checkpoint', 'wall'])");
    expect(src).toContain('const TOAST_MAX = 2;');
    expect(src).toContain('const TOAST_MS = 4000;');
    expect(src).toMatch(/toastText\(e, locale, flowRef\.current\.chapter, cardOf\)/);
    expect(src).toContain('.slice(-TOAST_MAX)');
    // The HUD redraws only when the snapshot changes.
    expect(src).toContain('prev && sameHud(prev, h) ? prev : h');
  });

  it('skips the lakon intro for one frame: Enter or E, or a pointerdown on the stage while the card is up, from 0.8 s', () => {
    expect(src).toContain('MISSION_TIMING.introSkipAfter');
    expect(src).toMatch(/onPointerDown=\{onStagePointerDown\}/);
    // readInput hands the skip over once, then clears it.
    expect(src).toMatch(/const skip = skipPulse\.current;\s*skipPulse\.current = false;/);
  });

  it('reads the keyboard on window by e.code, leaves text fields alone, clears held keys on blur and when hidden, and claims the game keys while playing', () => {
    expect(src).toContain("window.addEventListener('keydown', onKeyDown);");
    expect(src).toContain("window.addEventListener('keyup', onKeyUp);");
    expect(src).toContain("window.addEventListener('blur', release);");
    expect(src).toContain("document.addEventListener('visibilitychange', onVisibility);");
    for (const s of ["'INPUT'", "'TEXTAREA'", 'isContentEditable', 'keyAction(e.code)', 'e.preventDefault()', 'keys.current.clear()']) expect(src, s).toContain(s);
    // Every listener comes off again.
    for (const s of [
      "window.removeEventListener('keydown', onKeyDown);", "window.removeEventListener('keyup', onKeyUp);",
      "window.removeEventListener('blur', release);", "document.removeEventListener('visibilitychange', onVisibility);",
    ]) {
      expect(src, s).toContain(s);
    }
  });

  it('claims the game keys only once the chapter has started on this runtime: a play still waiting for its data leaves Enter and Space to the data error\'s Retry', () => {
    const driving = src.match(/const driving = \(\) => \{([\s\S]*?)\n {4}\};/)?.[1] ?? '';
    expect(driving).toContain("f.screen === 'play' && f.mode === '3d' && !f.paused");
    expect(driving).toContain("issued.current.rt === rt && issued.current.screen === 'play'");
    // The play is marked as issued only after the data check, so a play without data never claims the keys.
    expect(src).toMatch(/if \(flow\.screen === 'play' && !data\) return;\s*issued\.current = \{ rt, screen: flow\.screen, chapter: flow\.chapter \};/);
    // Both key handlers ask driving() before they claim a key.
    expect(src).toMatch(/if \(!driving\(\)\) return;\s*e\.preventDefault\(\);/);
    expect(src).toMatch(/keyAction\(e\.code\) !== null && driving\(\)\) e\.preventDefault\(\);/);
  });

  it('feeds the session settings to the input: steering assist and easy control', () => {
    expect(src).toContain('const [settings, setSettings] = useState<Settings>({ assist: false, easy: false });');
    expect(src).toMatch(/keyboardInput\(keys\.current, steer\.current, dt, \{ on: s\.easy, speed: /);
    expect(src).toMatch(/assist: s\.assist/);
  });

  it('takes the device from the media queries and the aspect from the canvas each frame', () => {
    expect(src).toContain("window.matchMedia('(max-width: 700px), (pointer: coarse)').matches");
    expect(src).toMatch(/aspect: \(\) => \{\s*const r = canvas\.getBoundingClientRect\(\);/);
  });

  it('full screen: on the stage, only where the browser allows it', () => {
    expect(src).toContain('stage.requestFullscreen()');
    expect(src).toMatch(/canFullscreen: document\.fullscreenEnabled === true/);
    expect(src).toContain("document.addEventListener('fullscreenchange', onFullscreenChange);");
  });

  it('renders on the server at the gate in 3D: no stage, HUD or toast region before play, and no name', () => {
    const html = renderToString(<BowobharataGame locale="en" />);
    expect(html).toContain(esc(FRAMING_EN[0]));
    for (const s of ['bg-stage', 'bg-hud', 'bg-toasts', 'bg-mission', 'data-cine', 'data-entry']) expect(html, s).not.toContain(s);
    for (const t of nonE) expect(html).not.toContain(esc(t.nama));
  });

  it('disposes the runtime before the scene, and shows the HUD only during play in 3D', () => {
    expect(src).toMatch(/runtime\?\.dispose\(\);\s*scene\?\.dispose\(\);/);
    expect(src).toMatch(/\{playing3d && hud && \(\s*<GameHud\b/);
  });

  it('pauses when the tab is hidden', () => {
    expect(src).toContain('visibilitychange');
  });
  it('shows Tercatat from the game data, and the fail card with its fails and the assist setting', () => {
    expect(src).toContain('const cards = data?.events[flow.chapter] ?? [];');
    expect(src).toMatch(
      /flow\.screen === 'recorded' && data && \(\s*<Recorded locale=\{locale\} chapterIndex=\{flow\.chapter\} cards=\{cards\} prologue=\{data\.prologue\} whole=\{whole\}/,
    );
    expect(src).toMatch(/flow\.screen === 'lost' && \(\s*<FailCard\b[^>]*?\sfails=\{flow\.fails\}[^>]*?\sassist=\{settings\.assist\}/);
    expect(src).toMatch(/<FallbackPlay\b[^>]*?\scards=\{cards\}[^>]*?\sprologue=\{data\.prologue\}/);
  });
  it('the skip marks the record as filled in and records the rest in the runtime before it dispatches, and every play makes the record whole again', () => {
    expect(src).toMatch(/onSkip=\{\(\) => \{ failClock\.current = null; setWhole\(false\); runtimeRef\.current\?\.skip\(\); dispatch\(\{ type: 'skip' \}\); \}\}/);
    expect(src).toMatch(/useEffect\(\(\) => \{ if \(flow\.screen === 'play'\) setWhole\(true\); \}, \[flow\.screen\]\);/);
  });
  it('shows no event card during play: CatchCard renders only inside Recorded and FallbackPlay', () => {
    // Spec call 7: names, titles and dossier facts appear only on still screens. While playing, the HUD count reports
    // each record; the island neither renders a card nor builds one, and has no in-play card overlay.
    expect(src).not.toMatch(/\bCatchCard\b/);
    expect(src).not.toMatch(/\bcardView\b/);
    expect(src).not.toContain('bg-cards');
    const screens = readFileSync('src/components/bowobharata-game/screens.tsx', 'utf8');
    const renderers = screens
      .split(/\n(?=(?:export )?(?:function|const) )/)
      .filter((part) => part.includes('<CatchCard'))
      .map((part) => part.match(/^(?:export )?(?:function|const) (\w+)/)?.[1]);
    expect(renderers.sort()).toEqual(['FallbackPlay', 'Recorded']);
  });
  it('keeps the slice check\'s automation hook (window.__bowo) behind import.meta.env.DEV, so a production build drops it', () => {
    // Comments become spaces of the same length, so the indices still point into the source.
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => ' '.repeat(c.length));
    /** Every `if (import.meta.env.DEV) {` block, from the `if` to its matching brace. */
    const guarded = [...code.matchAll(/if \(import\.meta\.env\.DEV\) \{/g)].map((m): [number, number] => {
      let depth = 1;
      let i = m.index! + m[0].length;
      for (; i < code.length && depth > 0; i++) depth += code[i] === '{' ? 1 : code[i] === '}' ? -1 : 0;
      return [m.index!, i];
    });
    const inside = (i: number) => guarded.some(([a, b]) => i >= a && i < b);
    const uses = (word: string) => [...code.matchAll(new RegExp(`\\b${word}\\b`, 'g'))].map((m) => m.index!);
    // The hook on window, and the override inside readInput, each sit in a guarded block.
    expect(code).toMatch(/useEffect\(\(\) => \{\s*if \(import\.meta\.env\.DEV\) \{\s*const w = window as /);
    expect(code).toMatch(/const readInput = \(\): Omit<FrameInput, 'aspect'> => \{\s*if \(import\.meta\.env\.DEV\) \{/);
    for (const word of ['__bowo', 'setInputOverride']) {
      expect(uses(word).length, word).toBeGreaterThan(0);
      for (const i of uses(word)) expect(inside(i), `${word} at ${i}`).toBe(true);
    }
    // The override itself is used only in guarded blocks; its declaration is the one use outside them.
    const declared = code.indexOf('let devInput: DevInput | null = null;');
    expect(declared).toBeGreaterThan(-1);
    for (const i of uses('devInput')) if (i !== declared + 'let '.length) expect(inside(i), `devInput at ${i}`).toBe(true);
    // Nothing else in src/ knows of the hook.
    const others = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? others(`${dir}/${d.name}`) : [`${dir}/${d.name}`]);
    for (const f of others('src')) if (f !== 'src/components/BowobharataGame.tsx') expect(readFileSync(f, 'utf8'), f).not.toContain('__bowo');
  });

  it('clears the site header: measures .nav into --nav-h on the game root, scrolls the stage under it once per chapter, and marks a pause', () => {
    expect(src).toContain("document.querySelector('.nav')");
    expect(src).toContain("style.setProperty('--nav-h'");
    expect(src).toMatch(/addEventListener\('resize', measure\)/);
    expect(src).toMatch(/scrollIntoView\(\{ block: 'start', behavior: reduced \? 'auto' : 'smooth' \}\)/);
    expect(src).toMatch(/scrolledFor\.current === flow\.chapter/);
    expect(src).toMatch(/data-paused=\{flow\.paused \? 'on' : undefined\}/);
  });

  it('reads touch and a gamepad, guarded, and feeds the rings to TouchControls', () => {
    expect(src).toContain('(pointer: coarse)');
    expect(src).toContain('getGamepads');
    expect(src).toMatch(/typeof navigator\.getGamepads !== 'function'/);
    expect(src).toContain('<TouchControls');
    expect(src).toMatch(/<TouchControls[\s\S]*?\bsurge=\{hud\.surge\}[\s\S]*?\bsight=\{hud\.sight\}/);
    expect(src).toContain('mergeInputs(');
    // Pause and skip edges come from one per-frame poll; blur lets go of touch and pad state too.
    expect(src).toContain('requestAnimationFrame(poll)');
    expect(src).not.toContain('setInterval');
    expect(src).toMatch(/touch\.current = \{ \.\.\.NO_TOUCH \};\s*padHeld\.current = /);
    // Easy control is a session setting: turned on for touch, never written to storage.
    expect(src).toMatch(/easy: true/);
    expect(src).not.toMatch(/writeSaved\([^)]*easy/);
    // The dev automation hook stays inside its DEV blocks.
    expect(src).toMatch(/if \(import\.meta\.env\.DEV\) \{[^}]*devInput/);
  });

  it('times the fail shot on the game clock (a unit-level check of the rule)', async () => {
    const { failShotDone } = await import('../src/lib/bowobharata-game/hud');
    expect(failShotDone(10, null, 1.2)).toBe(false);
    expect(failShotDone(10.5, 10, 1.2)).toBe(false);
    expect(failShotDone(11.5, 10, 1.2)).toBe(true);
    expect(failShotDone(11.5, 10.25, 1.25)).toBe(true);
    expect(failShotDone(11.49, 10.25, 1.25)).toBe(false);
    expect(failShotDone(Number.NaN, 10, 1.2)).toBe(false);
    expect(failShotDone(9, 10, 1.2)).toBe(false);
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

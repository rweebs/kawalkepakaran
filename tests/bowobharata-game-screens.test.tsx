import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { routePath, type Locale } from '../src/i18n';
import { FRAMING, PARVAS, parvaEvents } from '../src/lib/bowobharata';
import { FRAMING_EN, PARVAS_EN } from '../src/lib/bowobharata-en';
import { localizeEvent } from '../src/lib/linimasa-locale';
import type { Perkara } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { createWorld, startChapter } from '../src/lib/bowobharata-game/engine';
import { hudOf, type HudSnapshot, type ObjectiveKey } from '../src/lib/bowobharata-game/hud';
import type { GameEvent, HintKey } from '../src/lib/bowobharata-game/mission-run';
import { CHAPTER_TYPES, missionFor, type MissionType } from '../src/lib/bowobharata-game/missions';
import { RADAR_PX, radarPoint, type RadarItem, type RadarKind } from '../src/lib/bowobharata-game/radar';
import { RIUH } from '../src/lib/bowobharata-game/tuning';
import { ANCHORS } from '../src/lib/bowobharata-game/world';
import type { XZ } from '../src/lib/bowobharata-game/geom';
import { mulberry32 } from '../src/lib/sky/rng';
import {
  FailCard, Finale, GameHud, Gate, Intro, MissionCard, Paused, Radar, Recorded, SanjayaReport, SlowPrompt, TouchControls, cardView, toastText,
  type HudToast, type RadarProps,
} from '../src/components/bowobharata-game/screens';
import {
  EASE_MS, FADE_MS, ROUTE_OVERHANG, STATIC_MS, arcBusy, arcPath, arcSweep, drawMark, drawOrder, easedAt, fogFor, grainsRun, haloOpacity,
  mapView, markOpacity, modelBusy, noiseGrains, radarModel, retarget, settled, stepModel, tickModel, trackMarks, type Drawn, type MapView,
  type RadarModel,
} from '../src/components/bowobharata-game/Radar';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const game = gameData(data);
/** Each chapter's terlapor ids, as the island hands them to the report screens. */
const chapterIds = game.chapters.map((c) => c.entries.map((e) => e.id));
const LOCALES = ['id', 'en'] as const;
const noop = () => {};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const reply = (locale: Locale) => `href="${routePath('reply', locale)}"`;
/** Every terlapor, category E included, by full name, by the name before the parentheses and by the name inside them. */
const NAMES = data.terlapor.flatMap((t) => {
  const inner = t.nama.match(/\(([^)]+)\)/)?.[1];
  return [t.nama, t.nama.split(' (')[0], ...(inner ? [inner] : [])];
});
/** Every event title the game data holds, in both languages. */
const TITLES = game.events.flat().flatMap((c) => [c.title.id, c.title.en]);
/** The outer HTML of every element of `tag` that carries `attr`. Those elements are never nested in their own kind. */
const blocks = (html: string, tag: string, attr: string): string[] =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*${attr}[^>]*>[\\s\\S]*?</${tag}>`, 'g'))].map((m) => m[0]);
const count = (html: string, s: string) => html.split(s).length - 1;
/** The outer HTML of the first element whose start tag holds `marker`, up to its own closing tag. */
function element(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<', at);
  const tag = /^<([a-z][a-z0-9]*)/i.exec(html.slice(start))![1];
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`${marker}: the element is not closed`);
}
/** Each part is present, and its first occurrence comes after the first occurrence of the part before it. */
function expectOrder(html: string, parts: string[]) {
  let prev = -1;
  for (const part of parts) {
    const i = html.indexOf(part);
    expect(i, `${part} after position ${prev}`).toBeGreaterThan(prev);
    prev = i;
  }
}
const settings = { assist: false, easy: false };

describe('cardView', () => {
  it('reads one locale of an event card', () => {
    const e = game.events[1][0];
    for (const l of LOCALES) {
      expect(cardView(e, l)).toEqual({
        key: e.slug, date: e.dateLabel[l], dateTime: e.date, channel: e.channel[l], title: e.title[l], summary: e.summary[l], href: e.path[l],
      });
    }
  });
});

describe('Recorded (Tercatat)', () => {
  it('chapter 4, EN: 9 event cards, each with the EN allegation line and /en/right-of-reply', () => {
    const html = renderToString(<Recorded locale="en" chapterIndex={4} cards={game.events[4]} prologue={game.prologue} whole onNext={noop} report={game.report} />);
    expect(html).toContain(esc(GAME_COPY.en.recordedScreen.title));
    const cards = blocks(html, 'article', 'data-catch');
    expect(cards).toHaveLength(9);
    for (const c of cards) {
      expect(c).toContain(esc(GAME_COPY.en.allegation));
      expect(c).toContain('href="/en/right-of-reply"');
    }
    for (const e of game.events[4]) expect(html).toContain(esc(e.title.en));
    expect(html).not.toContain(esc(GAME_COPY.id.allegation));
    expect(html).not.toContain(esc(GAME_COPY.en.recordedScreen.skipped));
    expect(html).not.toContain('prologue-dates');
  });

  it('prologue: the count, then one framed block of the 8 dates, with no event card and no terlapor name', () => {
    expect(game.prologue).toHaveLength(8);
    for (const l of LOCALES) {
      const html = renderToString(<Recorded locale={l} chapterIndex={0} cards={[]} prologue={game.prologue} whole onNext={noop} report={game.report} />);
      expect(html).toContain(esc(GAME_COPY[l].recordedScreen.prologue({ n: 8 })));
      expect(html).not.toContain('data-catch');
      for (const n of NAMES) expect(html, n).not.toContain(esc(n));
      const framed = blocks(html, 'section', 'data-entry="prologue-dates"');
      expect(framed).toHaveLength(1);
      expect(count(html, 'data-entry="prologue-dates"')).toBe(1);
      const [block] = framed;
      expect(block).toMatch(/^<section class="bg-entry" data-entry="prologue-dates">/);
      expect(block.match(/<time\b/g)).toHaveLength(8);
      expect(html.match(/<time\b/g)).toHaveLength(8);
      for (const d of game.prologue) expect(block).toMatch(new RegExp(`datetime="${d.iso}"`, 'i'));
      expect(block).toContain(esc(GAME_COPY[l].recordedScreen.dates));
      expect(block).toContain(esc(GAME_COPY[l].allegation));
      expect(block).toContain(reply(l));
      // The count comes before the framed block.
      expect(html.indexOf(esc(GAME_COPY[l].recordedScreen.prologue({ n: 8 })))).toBeLessThan(html.indexOf('data-entry="prologue-dates"'));
    }
  });

  it('whole: false shows the note that part of the record was filled in', () => {
    for (const i of [0, 1]) {
      const one = (whole: boolean) =>
        renderToString(<Recorded locale="id" chapterIndex={i} cards={game.events[i]} prologue={game.prologue} whole={whole} onNext={noop} report={game.report} />);
      expect(one(false)).toContain(esc(GAME_COPY.id.recordedScreen.skipped));
      expect(one(true)).not.toContain(esc(GAME_COPY.id.recordedScreen.skipped));
    }
  });

  it('goes on with the next button', () => {
    const html = renderToString(<Recorded locale="id" chapterIndex={1} cards={game.events[1]} prologue={game.prologue} whole onNext={noop} report={game.report} />);
    expect(html).toContain(esc(GAME_COPY.id.actions.next));
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe('FailCard', () => {
  const fail = (locale: Locale, reason: 'time' | 'muddied', fails: number, assist: boolean) =>
    renderToString(<FailCard locale={locale} reason={reason} fails={fails} assist={assist} onRetry={noop} onSkip={noop} />);

  for (const l of LOCALES) {
    const f = GAME_COPY[l].fail;
    it(`${l}: the reason text for 'time' and 'muddied'`, () => {
      const time = fail(l, 'time', 1, true);
      expect(time).toContain(esc(f.title));
      expect(time).toContain(esc(f.time));
      expect(time).not.toContain(esc(f.muddied));
      const muddied = fail(l, 'muddied', 1, true);
      expect(muddied).toContain(esc(f.muddied));
      expect(muddied).not.toContain(esc(f.time));
    });

    it(`${l}: retry always; the skip and its note only from the second fail`, () => {
      const one = fail(l, 'time', 1, true);
      expect(one).toContain(esc(f.retry));
      expect(one).not.toContain(esc(f.skip));
      expect(one).not.toContain(esc(f.skipNote));
      expect(one.match(/<button/g)).toHaveLength(1);
      for (const fails of [2, 3]) {
        const more = fail(l, 'muddied', fails, true);
        expect(more).toContain(esc(f.skip));
        expect(more).toContain(esc(f.skipNote));
        expect(more.match(/<button/g)).toHaveLength(2);
      }
    });

    it(`${l}: the assist line only while steering assist is off`, () => {
      expect(fail(l, 'time', 1, false)).toContain(esc(f.assist));
      expect(fail(l, 'time', 1, true)).not.toContain(esc(f.assist));
    });
  }
});

describe('MissionCard', () => {
  it('chapter 1, ID: rooted at .bg-mission with the kicker, the parva title, the type chip and the guide line, never the episode', () => {
    const c = GAME_COPY.id;
    const html = renderToString(<MissionCard locale="id" chapterIndex={1} type="himpun" />);
    expect(html).toMatch(/^<section class="[^"]*\bbg-mission\b[^"]*"/);
    expect(html).toContain(esc(c.lakonKicker({ label: 'Parva 1' })));
    expect(html).toContain(esc(PARVAS[0].title));
    expect(html).toContain(esc(c.types.himpun));
    expect(html).toContain(esc(c.krishnaLine['dadu-di-hastinapura']));
    expect(html).not.toContain(esc(PARVAS[0].episode));
    expect(html).not.toMatch(/Sengkuni/);
  });

  it('EN shows the EN title and type, and the prologue is labelled by its own title', () => {
    const en = renderToString(<MissionCard locale="en" chapterIndex={1} type="himpun" />);
    expect(en).toContain(esc(PARVAS_EN[PARVAS[0].id].title));
    expect(en).toContain(esc(GAME_COPY.en.types.himpun));
    expect(en).not.toContain(esc(PARVAS_EN[PARVAS[0].id].episode));
    for (const l of LOCALES) {
      const c = GAME_COPY[l];
      const prologue = renderToString(<MissionCard locale={l} chapterIndex={0} type="himpun" />);
      expect(prologue).toContain(esc(c.lakonKicker({ label: c.prologueTitle })));
      expect(prologue).toContain(esc(c.krishnaLine.prologue));
      expect(prologue).not.toContain(esc(c.prologueIntro));
      expect(count(prologue, esc(c.prologueTitle))).toBe(1);
    }
  });

  it('names each type by its own chip', () => {
    for (const type of ['himpun', 'antar', 'lintasan', 'uji'] as const) {
      const html = renderToString(<MissionCard locale="en" chapterIndex={2} type={type} />);
      expect(html).toContain(esc(GAME_COPY.en.types[type]));
    }
  });
});

describe('Paused', () => {
  for (const l of LOCALES) {
    it(`${l}: FRAMING, the notes, the reply link, both control lists, two toggles and the version without animation`, () => {
      const c = GAME_COPY[l];
      const html = renderToString(<Paused locale={l} onResume={noop} settings={{ assist: true, easy: false }} onSettings={noop} onUseStill={noop} />);
      expect(html).toContain(esc((l === 'id' ? FRAMING : FRAMING_EN)[0]));
      expect(html).toContain(esc(c.armyNote));
      expect(html).toContain(esc(c.pelaporNote));
      expect(html).toContain(reply(l));
      expect(html).toContain(esc(c.actions.resume));
      for (const t of [c.controlsTitle.keys, c.controlsTitle.touch, ...c.controlsKeys, ...c.controlsTouch]) expect(html, t).toContain(esc(t));
      const toggles = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[2], m[1]]);
      expect(toggles).toEqual([[esc(c.settings.assist), 'true'], [esc(c.settings.easy), 'false']]);
      expect(html).toContain(esc(c.settings.still));
      expect(html).toMatch(/<a href="\?fallback=1"[^>]*>[^<]*<\/a>/);
      expect(html).not.toContain(esc(c.settings.retry));
      expect(html).not.toContain(esc(c.settings.toMarker));
    });
  }

  for (const l of LOCALES) {
    it(`${l}: the brief's order: resume, FRAMING, the notes, the reply link, the controls, the toggles, then the version without animation`, () => {
      const c = GAME_COPY[l];
      const framing = l === 'id' ? FRAMING : FRAMING_EN;
      const html = renderToString(<Paused locale={l} onResume={noop} settings={settings} onSettings={noop} onRetry={noop} onToMarker={noop} onUseStill={noop} />);
      expectOrder(html, [
        esc(c.actions.resume), esc(c.settings.retry), esc(c.settings.toMarker),
        ...framing.map(esc), esc(c.armyNote), esc(c.pelaporNote), reply(l),
        esc(c.controlsTitle.keys), esc(c.controlsTitle.touch),
        esc(c.settings.title), 'aria-pressed=', 'href="?fallback=1"',
      ]);
      const toggle = html.indexOf('aria-pressed=');
      for (const line of [...c.controlsKeys, ...c.controlsTouch]) expect(html.indexOf(esc(line)), line).toBeLessThan(toggle);
      expect(html.indexOf('href="?fallback=1"')).toBeGreaterThan(html.lastIndexOf('aria-pressed='));
    });
  }

  it('offers retry and the way to the marker only when given', () => {
    const c = GAME_COPY.en;
    const html = renderToString(<Paused locale="en" onResume={noop} settings={settings} onSettings={noop} onRetry={noop} onToMarker={noop} onUseStill={noop} />);
    expect(html).toContain(esc(c.settings.retry));
    expect(html).toContain(esc(c.settings.toMarker));
  });
});

describe('Gate', () => {
  for (const l of LOCALES) {
    it(`${l}: armyNote and pelaporNote sit after FRAMING[0] and before the start button; the controls are two titled lists`, () => {
      const c = GAME_COPY[l];
      const html = renderToString(<Gate locale={l} fallback={false} onStart={noop} />);
      const framing = html.indexOf(esc((l === 'id' ? FRAMING : FRAMING_EN)[0]));
      const start = html.indexOf(esc(c.gateStart));
      expect(framing).toBeGreaterThan(-1);
      for (const note of [c.armyNote, c.pelaporNote]) {
        const i = html.indexOf(esc(note));
        expect(i, note).toBeGreaterThan(framing);
        expect(i, note).toBeLessThan(start);
      }
      expectOrder(html, [esc((l === 'id' ? FRAMING : FRAMING_EN)[0]), esc(c.armyNote), esc(c.pelaporNote), reply(l), esc(c.gateStart)]);
      expect(count(html, reply(l))).toBe(1);
      const keys = html.indexOf(esc(c.controlsTitle.keys));
      const touch = html.indexOf(esc(c.controlsTitle.touch));
      expect(keys).toBeGreaterThan(-1);
      expect(touch).toBeGreaterThan(keys);
      for (const line of c.controlsKeys) {
        expect(html.indexOf(esc(line)), line).toBeGreaterThan(keys);
        expect(html.indexOf(esc(line)), line).toBeLessThan(touch);
      }
      for (const line of c.controlsTouch) expect(html.indexOf(esc(line)), line).toBeGreaterThan(touch);
      expect(html.match(/<ul class="bg-controls">/g)).toHaveLength(2);
    });
  }
});

describe('Intro', () => {
  it('takes a corner layout in 3D, and keeps its content', () => {
    const plain = renderToString(<Intro locale="id" chapterIndex={1} onNext={noop} />);
    const corner = renderToString(<Intro locale="id" chapterIndex={1} onNext={noop} layout="corner" />);
    expect(plain).not.toContain('data-layout');
    expect(plain).not.toMatch(/\bbg-mission\b/);
    expect(corner).toContain('data-layout="corner"');
    expect(corner).toMatch(/^<section class="[^"]*\bbg-mission\b[^"]*"/);
    for (const s of [esc(PARVAS[0].title), esc(GAME_COPY.id.krishnaLine['dadu-di-hastinapura']), esc(GAME_COPY.id.actions.play)]) {
      expect(plain).toContain(s);
      expect(corner).toContain(s);
    }
  });
});

describe('Finale', () => {
  for (const l of LOCALES) {
    it(`${l}: the closing line sits in a framed block with the allegation line and the reply link`, () => {
      const html = renderToString(<Finale locale={l} totals={game.totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
      const framed = blocks(html, 'article', 'data-entry="finale-close"');
      expect(framed).toHaveLength(1);
      expect(framed[0]).toMatch(/^<article class="bg-entry bg-close" data-entry="finale-close">/);
      expect(framed[0]).toContain(esc(GAME_COPY[l].finaleClose));
      expect(framed[0]).toContain(esc(GAME_COPY[l].allegation));
      expect(framed[0]).toContain(reply(l));
      expect(count(html, esc(GAME_COPY[l].finaleClose))).toBe(1);
    });
  }
});

describe('SlowPrompt', () => {
  it('renders the message and both buttons', () => {
    for (const l of LOCALES) {
      const s = GAME_COPY[l].slow;
      const html = renderToString(<SlowPrompt locale={l} onUseStill={noop} onKeepPlaying={noop} />);
      expect(html).toContain(esc(s.message));
      const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
      expect(buttons).toEqual([esc(s.useStill), esc(s.keepPlaying)]);
    }
  });
});

describe('toastText', () => {
  /** What the island will hand toastText: a card's date and channel in one locale, or null when the chapter has none. */
  const cardOf = (chapter: number, locale: Locale) => (card: number) => {
    const e = game.events[chapter]?.[card];
    return e ? { date: e.dateLabel[locale], channel: e.channel[locale] } : null;
  };
  const recorded = (card: number, n: number, total: number): GameEvent => ({ type: 'recorded', id: `r${card}`, card, n, total });

  it('chapter 1, recorded 1/2: the count, the date and the channel', () => {
    const e = game.events[1][0];
    expect(toastText(recorded(0, 1, 2), 'id', 1, cardOf(1, 'id'))).toBe(`Tercatat 1/2 · ${e.dateLabel.id} · ${e.channel.id}`);
    expect(toastText(recorded(0, 1, 2), 'en', 1, cardOf(1, 'en'))).toBe(`Recorded 1/2 · ${e.dateLabel.en} · ${e.channel.en}`);
  });

  it('prologue 3/8: the count only, even when a date is at hand', () => {
    const dated = () => ({ date: '24 September 2023', channel: 'LinkedIn' });
    const id = toastText(recorded(2, 3, 8), 'id', 0, dated);
    expect(id).toBe('Tercatat 3/8');
    expect(id).not.toMatch(/\d{4}/);
    const en = toastText(recorded(2, 3, 8), 'en', 0, dated);
    expect(en).toBe('Recorded 3/8');
    expect(en).not.toMatch(/\d{4}/);
  });

  it('a card it cannot find falls back to the count', () => {
    expect(toastText(recorded(5, 1, 2), 'id', 1, () => null)).toBe('Tercatat 1/2');
  });

  it('held, wall, filed, rewriteTaken and checkpoint give their lines', () => {
    for (const l of LOCALES) {
      const t = GAME_COPY[l].toasts;
      const none = () => null;
      expect(toastText({ type: 'held' }, l, 1, none)).toBe(t.ranks);
      expect(toastText({ type: 'wall' }, l, 1, none)).toBe(t.wall);
      expect(toastText({ type: 'filed' }, l, 1, none)).toBe(t.filed);
      expect(toastText({ type: 'rewriteTaken' }, l, 1, none)).toBe(t.rewrite);
      expect(toastText({ type: 'checkpoint' }, l, 1, none)).toBe(t.checkpoint);
    }
  });

  it('a rewrite gate, the letter and each lap give their lines, in both locales; a real gate leaves the toast to its record', () => {
    for (const l of LOCALES) {
      const t = GAME_COPY[l].toasts;
      const none = () => null;
      expect(toastText({ type: 'gate', real: false, day: 2 }, l, 4, none)).toBe(t.gate);
      expect(toastText({ type: 'gate', real: true, day: 1 }, l, 4, none)).toBeNull();
      expect(toastText({ type: 'letter' }, l, 2, none)).toBe(t.letter);
      for (const matched of [false, true]) {
        const lap: GameEvent = { type: 'lap', n: 2, seconds: 51.27, matched };
        expect(toastText(lap, l, 5, none)).toBe(t.lap({ n: 2, seconds: 51.27, matched }));
      }
    }
    expect(toastText({ type: 'lap', n: 2, seconds: 51.27, matched: false }, 'id', 5, () => null)).toBe('Putaran 2 · 51,3 detik');
    expect(toastText({ type: 'lap', n: 2, seconds: 51.27, matched: false }, 'en', 5, () => null)).toBe('Lap 2 · 51.3 s');
    // Matched by the times or by the fifth lap: either way the re-test is done.
    const matched = (l: Locale) => toastText({ type: 'lap', n: 2, seconds: 51.27, matched: true }, l, 5, () => null)!;
    expect(matched('id')).toBe('Putaran 2 · 51,3 detik · uji ulang selesai');
    expect(matched('en')).toBe('Lap 2 · 51.3 s · re-test complete');
  });

  it('a rewrite gate shows one toast: its rewriteTaken stays quiet in the frame it is crossed; a copy taken still shows its own', () => {
    for (const l of LOCALES) {
      const t = GAME_COPY[l].toasts;
      const crossing: GameEvent[] = [{ type: 'gate', real: false, day: 2 }, { type: 'rewriteTaken' }];
      expect(crossing.flatMap((e) => toastText(e, l, 4, () => null, crossing) ?? [])).toEqual([t.gate]);
      const copy: GameEvent[] = [{ type: 'rewriteTaken' }];
      expect(copy.flatMap((e) => toastText(e, l, 4, () => null, copy) ?? [])).toEqual([t.rewrite]);
      expect(toastText({ type: 'rewriteTaken' }, l, 4, () => null)).toBe(t.rewrite);
    }
    // The gate's line says both: a rewrite, and that it went into the record.
    expect(GAME_COPY.id.toasts.gate).toMatch(/tulisan ulang[\s\S]*masuk ke catatan/);
    expect(GAME_COPY.en.toasts.gate).toMatch(/rewrite[\s\S]*into the record/);
  });

  it("a replay's end and a free lap give the roam lines, with their score and best, or their seconds and best, in both locales", () => {
    for (const l of LOCALES) {
      const r = GAME_COPY[l].roam;
      expect(toastText({ type: 'replayDone', chapter: 1, score: 340, best: 420 }, l, 3, () => null)).toBe(r.replayDone({ score: 340, best: 420 }));
      expect(toastText({ type: 'freeLap', seconds: 52.34, best: 50.06 }, l, 3, () => null)).toBe(r.freeLap({ seconds: 52.34, best: 50.06 }));
    }
    expect(toastText({ type: 'replayDone', chapter: 1, score: 340, best: 420 }, 'id', 3, () => null)).toBe('Main lagi selesai · skor 340 · terbaik 420');
    expect(toastText({ type: 'replayDone', chapter: 1, score: 340, best: 420 }, 'en', 3, () => null)).toBe('Replay over · score 340 · best 420');
    // A replay that failed scores 0 and keeps its best (ruling 10).
    expect(toastText({ type: 'replayDone', chapter: 1, score: 0, best: 420 }, 'en', 3, () => null)).toBe('Replay over · score 0 · best 420');
    expect(toastText({ type: 'freeLap', seconds: 52.34, best: 50.06 }, 'id', 3, () => null)).toBe('Putaran bebas · 52,3 detik · terbaik 50,1 detik');
    expect(toastText({ type: 'freeLap', seconds: 52.34, best: 50.06 }, 'en', 3, () => null)).toBe('Free lap · 52.3 s · best 50.1 s');
  });

  it('the events that are not toasts give null', () => {
    const quiet: GameEvent[] = [
      { type: 'introStart' }, { type: 'introEnd' }, { type: 'bump', speed: 4 }, { type: 'absorbed' }, { type: 'stepDone', step: 0 },
      { type: 'level', level: 2 }, { type: 'hint', key: 'ride' }, { type: 'volley', id: 1 }, { type: 'outroStart' },
      { type: 'failed', reason: 'time' }, { type: 'done', score: 300, whole: true }, { type: 'gate', real: true, day: 1 },
    ];
    for (const e of quiet) expect(toastText(e, 'id', 1, cardOf(1, 'id')), e.type).toBeNull();
  });

  it('over every chapter, event and locale, it never holds a terlapor name or an event title', () => {
    const others: GameEvent[] = [
      { type: 'introStart' }, { type: 'introEnd' }, { type: 'gate', real: true, day: 1 }, { type: 'gate', real: false, day: 2 },
      { type: 'rewriteTaken' }, { type: 'filed' }, { type: 'bump', speed: 6 }, { type: 'held' }, { type: 'wall' }, { type: 'absorbed' },
      { type: 'checkpoint' }, { type: 'stepDone', step: 1 }, { type: 'lap', n: 1, seconds: 52, matched: true }, { type: 'letter' },
      { type: 'level', level: 3 }, { type: 'hint', key: 'sight' }, { type: 'volley', id: 2 }, { type: 'outroStart' },
      { type: 'failed', reason: 'muddied' }, { type: 'done', score: 300, whole: false },
      { type: 'replayDone', chapter: 1, score: 300, best: 400 }, { type: 'freeLap', seconds: 52, best: 50 },
    ];
    const texts: string[] = [];
    let dated = 0;
    for (const l of LOCALES) {
      for (let chapter = 0; chapter < game.chapters.length; chapter++) {
        const cards = game.events[chapter];
        const total = chapter === 0 ? game.prologue.length : cards.length;
        const records = Array.from({ length: Math.max(total, 1) }, (_, k) => recorded(k, k + 1, total));
        for (const e of [...records, ...others]) {
          const s = toastText(e, l, chapter, cardOf(chapter, l));
          if (s === null) continue;
          texts.push(s);
          for (const n of NAMES) expect(s, `${n} in ${s}`).not.toContain(n);
          for (const t of TITLES) expect(s, `${t} in ${s}`).not.toContain(t);
          if (e.type === 'recorded' && chapter > 0 && cards[e.card]) {
            expect(s).toContain(cards[e.card].dateLabel[l]);
            dated++;
          }
        }
      }
    }
    expect(dated).toBe(2 * game.events.flat().length);
    expect(texts.length).toBeGreaterThan(dated);
  });
});

// ── The radar ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The radar's centre and inner radius on its RADAR_PX square (radar.ts clamps to the inner radius). */
const C = RADAR_PX / 2;
const R = RADAR_PX / 2 - 8;
const KINDS: RadarKind[] = ['ranks', 'shelter', 'route', 'decoy', 'tower', 'replay', 'marker', 'record', 'gate', 'post'];
/** A point on the rim, `deg` degrees clockwise from the top. */
const rim = (deg: number) => ({ x: C + R * Math.sin((deg * Math.PI) / 180), y: C - R * Math.cos((deg * Math.PI) / 180) });
/** One or two items of every kind on the square, some clamped to the rim: kinds and positions only, as radarItems has them. */
const ITEMS: RadarItem[] = [
  // An army block reaching in from the north-east: its middle clamped to the rim, its corners not.
  { kind: 'ranks', ...rim(60), clamped: true, dist: 6, points: [{ x: 96, y: 4 }, { x: 196, y: 4 }, { x: 196, y: 70 }, { x: 96, y: 70 }] },
  { kind: 'shelter', x: 40, y: 100, clamped: false, dist: 44 },
  { kind: 'shelter', ...rim(270), clamped: true, dist: 160 },
  { kind: 'route', ...rim(0), clamped: true, dist: 240, points: [{ x: 74, y: 74 }, { x: 70, y: 40 }, rim(0)] },
  { kind: 'decoy', x: 60, y: 50, clamped: false, dist: 25 },
  { kind: 'tower', ...rim(90), clamped: true, dist: 180 },
  { kind: 'replay', x: 30, y: 30, clamped: false, dist: 60 },
  { kind: 'marker', x: 90, y: 110, clamped: false, dist: 40 },
  { kind: 'record', x: 70, y: 60, clamped: false, dist: 15 },
  { kind: 'record', ...rim(180), clamped: true, dist: 300 },
  { kind: 'gate', x: 100, y: 90, clamped: false, dist: 30 },
  { kind: 'post', x: 50, y: 74, clamped: false, dist: 25 },
  { kind: 'post', x: 110, y: 50, clamped: false, dist: 45 },
];
const radarWorld = createWorld({ mobile: false });
/**
 * Chapter ch's lakon, active (at `step` if given), its snapshot taken with the chariot at rest at `at` (or where the lakon
 * starts), the clamour at `riuh`, Mata on or off, and the route ahead along `route` (world points) or none.
 */
function realSnap(
  ch: number, at: { x: number; z: number; yaw: number } | null, o: { riuh?: number; sight?: boolean; step?: number; route?: XZ[] } = {},
): HudSnapshot {
  // Each chapter's own number of records, as the radar test has them.
  const def = missionFor(ch, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].slice(0, [0, 2, 2, 4, 9, 1, 2, 2, 2][ch]));
  const s = startChapter(def, def.start, 1, radarWorld);
  const car = at ? initChariot(at.x, at.z, at.yaw) : s.car;
  const run = { ...s.run, phase: 'active' as const, ...(o.step === undefined ? {} : { step: o.step }) };
  const route = o.route ? { target: 'test', points: o.route } : null;
  const state = { ...s, car, route, run, riuh: { ...s.riuh, value: o.riuh ?? 0 }, sight: { ...s.sight, on: o.sight ?? false } };
  return hudOf(state, radarWorld);
}
/** 7 m off the Kurawa block, at rest, facing east, with a route running north from the chariot for 200 m. */
const BY_RANKS = { x: 24, z: 20, yaw: 0 };
const NORTH_ROUTE: XZ[] = [{ x: 24, z: 20 }, { x: 24, z: -180 }];

describe('GameHud', () => {
  /** A HUD snapshot of the prologue, 2 of 8 recorded, with any field replaced. */
  const snap = (o: Partial<HudSnapshot> = {}): HudSnapshot => ({
    phase: 'active', chapter: 0, type: 'himpun', objective: 'prologue', done: 2, total: 8, lap: null, timer: null, speedKmh: 31,
    surge: { ready: true, frac: 1 }, sight: { on: false, charge: 0.5 }, hint: null,
    riuh: 0, level: 0, staticFrac: 0, radar: [], radarM: 70, heading: 0, replay: false, ...o,
  });
  interface Opts {
    locale?: Locale; hud?: Partial<HudSnapshot>; touch?: boolean; paused?: boolean; toasts?: HudToast[]; canFullscreen?: boolean; fullscreen?: boolean;
  }
  const gameHud = (o: Opts = {}) =>
    renderToString(
      <GameHud
        locale={o.locale ?? 'id'} hud={snap(o.hud)} touch={o.touch ?? false} paused={o.paused ?? false} toasts={o.toasts ?? []}
        onPause={noop} onFullscreen={noop} canFullscreen={o.canFullscreen ?? true} fullscreen={o.fullscreen}
      />,
    );
  const OBJECTIVES: ObjectiveKey[] = ['roam', 'prologue', 'collect', 'tower', 'gate', 'course', 'laps', 'stop', 'none'];
  const HINTS: HintKey[] = ['ride', 'steer', 'slow', 'rewrites', 'sight', 'stop', 'surge', 'drift'];

  it('shows the objective, the frame line and the pause button, in both locales', () => {
    for (const l of LOCALES) {
      const c = GAME_COPY[l];
      const html = gameHud({ locale: l });
      expect(html).toContain(esc(c.objectives.prologue({ done: 2, total: 8 })));
      expect(html).toContain(esc(c.hudFrame));
      expect(html).toContain('<button');
      expect(html).toContain(esc(c.hud.pause));
    }
  });

  it('the objective panel holds the objective, the hint line, the timer, the frame line and both buttons', () => {
    const c = GAME_COPY.id;
    const html = gameHud({ hud: { hint: 'sight', timer: 75 } });
    const panel = element(html, 'class="bg-objective"');
    for (const part of [c.objectives.prologue({ done: 2, total: 8 }), c.hints.sight.keys, '1:15', c.hudFrame, c.hud.pause, c.fullscreen]) {
      expect(panel, part).toContain(esc(part));
    }
    expect(panel.match(/<button/g)).toHaveLength(2);
    expect(count(html, '<button')).toBe(2);
  });

  it('the panel opens with its Pause and Full screen row, so the row stays at the top whatever the lines under it (fix round 3)', () => {
    // DOM order, visual order and focus order match: the row, then the objective, the hint line, the timer and the frame.
    for (const touch of [false, true]) {
      for (const canFullscreen of [false, true]) {
        const panel = element(gameHud({ hud: { hint: 'sight', timer: 75 }, touch, canFullscreen }), 'class="bg-objective"');
        expect(panel, `touch ${touch}`).toMatch(/^<div class="bg-objective"><div class="bg-actions"><button type="button" class="btn"/);
        expectOrder(panel, ['class="bg-actions"', 'class="bg-objective__line"', 'class="bg-hint"', 'class="bg-timer"', 'class="bg-frame"']);
      }
    }
    // Every panel the css test's model takes (each objective, each hint or none, with a timer or none, both languages)
    // opens with the row, so the row's box is the same for all of them: the model places it at the panel's top.
    let variants = 0;
    for (const locale of LOCALES) {
      for (const objective of OBJECTIVES) {
        for (const hint of [...HINTS, null]) {
          for (const timer of [188.8, null]) {
            const panel = element(gameHud({ locale, touch: true, hud: { objective, hint, timer, lap: 5, done: 9, total: 9 } }), 'class="bg-objective"');
            expect(panel, `${locale} ${objective} ${hint} ${timer}`).toMatch(/^<div class="bg-objective"><div class="bg-actions">/);
            variants++;
          }
        }
      }
    }
    expect(variants).toBe(2 * 9 * 9 * 2);
  });

  it('during a replay the roam.replay line opens the panel\'s text, right after the Pause and Full screen row, and takes the hint line\'s place', () => {
    for (const locale of LOCALES) {
      const c = GAME_COPY[locale];
      for (const touch of [false, true]) {
        for (const canFullscreen of [false, true]) {
          const where = `${locale}, touch ${touch}, full screen ${canFullscreen}`;
          const html = gameHud({ locale, touch, canFullscreen, hud: { replay: true, hint: 'surge', timer: 75, objective: 'collect' } });
          const panel = element(html, 'class="bg-objective"');
          // The row, then the replay line straight after it, then the objective, the timer and the frame line.
          expect(panel, where).toMatch(/^<div class="bg-objective"><div class="bg-actions">[\s\S]*?<\/div><p class="bg-replay">/);
          const line = element(panel, 'class="bg-replay"');
          expect(line, where).toBe(`<p class="bg-replay">${esc(c.roam.replay)}</p>`);
          expectOrder(panel, ['class="bg-actions"', 'class="bg-replay"', 'class="bg-objective__line"', 'class="bg-timer"', 'class="bg-frame"']);
          // No hint line beside it, though the snapshot has one.
          expect(html, where).not.toContain('bg-hint');
          expect(count(html, 'class="bg-replay"')).toBe(1);
        }
      }
      // Not a replay: no replay line, and the hint is back.
      const plain = gameHud({ locale, hud: { replay: false, hint: 'surge' } });
      expect(plain).not.toContain('bg-replay');
      expect(plain).not.toContain(esc(c.roam.replay));
      expect(plain).toContain('class="bg-hint"');
    }
  });

  it('the hint line is a .bg-hint inside .bg-objective, worded for the keys or for touch, and absent without a hint', () => {
    for (const l of LOCALES) {
      const c = GAME_COPY[l];
      for (const key of HINTS) {
        for (const touch of [false, true]) {
          const html = gameHud({ locale: l, hud: { hint: key }, touch });
          const hint = element(element(html, 'class="bg-objective"'), 'class="bg-hint"');
          expect(hint).toMatch(/^<p class="bg-hint">/);
          expect(hint, `${l} ${key} ${touch}`).toContain(esc(touch ? c.hints[key].touch : c.hints[key].keys));
          expect(count(html, 'class="bg-hint"')).toBe(1);
        }
      }
    }
    expect(gameHud()).not.toContain('bg-hint');
  });

  it('the toasts sit in a polite status region, in order, that reads each new toast alone (not atomic)', () => {
    // role=status is atomic by default: each push would read the older toast again with the new one. With aria-atomic
    // false (and aria-relevant at its default, additions and text) only the toast added is read, once.
    const empty = gameHud();
    expect(empty).toContain('<div class="bg-toasts" role="status" aria-live="polite" aria-atomic="false"></div>');
    const toasts = [{ id: 7, text: GAME_COPY.id.toasts.checkpoint }, { id: 8, text: GAME_COPY.id.toasts.recordedPrologue({ n: 3, total: 8 }) }];
    const region = element(gameHud({ toasts }), 'class="bg-toasts"');
    expect(region).toMatch(/^<div class="bg-toasts" role="status" aria-live="polite" aria-atomic="false">/);
    expect(region).not.toContain('aria-relevant');
    expectOrder(region, toasts.map((t) => esc(t.text)));
  });

  it('the timer reads m:ss, and shows nothing when the lakon has none', () => {
    const none = gameHud({ hud: { timer: null } });
    expect(none).not.toContain('bg-timer');
    expect(none).not.toMatch(/\d:\d\d/);
    expect(element(gameHud({ hud: { timer: 25 } }), 'class="bg-timer"')).toContain('>0:25<');
    expect(gameHud({ hud: { timer: 125 } })).toContain('>2:05<');
    expect(gameHud({ hud: { timer: 600 } })).toContain('>10:00<');
    expect(gameHud({ hud: { timer: 0 } })).toContain('>0:00<');
  });

  it('the root is .bg-hud, with data-touch only on touch', () => {
    expect(gameHud()).toMatch(/^<div class="bg-hud">/);
    expect(gameHud({ touch: true })).toMatch(/^<div class="bg-hud" data-touch="">/);
    expect(gameHud()).not.toContain('data-touch');
  });

  it('the gauges show the speed, and the Laju and Mata rings unless on touch', () => {
    for (const l of LOCALES) {
      const c = GAME_COPY[l];
      const desk = element(gameHud({ locale: l }), 'class="bg-gauges"');
      const speed = element(desk, 'data-gauge="speed"');
      expect(speed).toContain('>31<');
      expect(speed).toContain(esc(c.ride.speedUnit));
      expect(count(desk, 'data-ring="surge"')).toBe(1);
      expect(count(desk, 'data-ring="sight"')).toBe(1);
      expect(element(desk, 'data-ring="surge"')).toContain(esc(c.ride.surge));
      expect(element(desk, 'data-ring="sight"')).toContain(esc(c.ride.sight));
      // On touch the buttons carry the rings and the speed sits under the radar (Task 34), so there is no gauges panel.
      const touch = gameHud({ locale: l, touch: true });
      expect(element(touch, 'class="bg-radar-slot"')).toContain('data-gauge="speed"');
      expect(touch).not.toContain('bg-gauges');
      expect(touch).not.toContain('data-ring');
    }
  });

  it('the radar sits in .bg-radar-slot on its RADAR_PX square, labelled with the range in whole metres; the speed stays in the gauges on a desk', () => {
    for (const l of LOCALES) {
      const html = gameHud({ locale: l, hud: { radarM: 107.4, radar: ITEMS } });
      const slot = element(html, 'class="bg-radar-slot"');
      const map = element(slot, 'role="img"');
      expect(map).toContain(`width="${RADAR_PX}" height="${RADAR_PX}" viewBox="0 0 ${RADAR_PX} ${RADAR_PX}"`);
      expect(map).toContain(`aria-label="${esc(GAME_COPY[l].ride.radar({ m: 107 }))}"`);
      expect(count(slot, 'data-kind=')).toBe(ITEMS.length);
      expect(slot).toContain('role="meter"');
      expect(slot).not.toContain('data-gauge');
      expect(count(html, 'data-gauge="speed"')).toBe(1);
      expect(element(html, 'class="bg-gauges"')).toContain('data-gauge="speed"');
    }
    // 107.5 m reads as 108: the range is rounded, not cut.
    expect(gameHud({ hud: { radarM: 107.5 } })).toContain(`aria-label="${esc(GAME_COPY.id.ride.radar({ m: 108 }))}"`);
  });

  it('on touch, GameHud places the speed inside .bg-radar-slot, under the radar', () => {
    for (const l of LOCALES) {
      const html = gameHud({ locale: l, touch: true, hud: { speedKmh: 58 } });
      const slot = element(html, 'class="bg-radar-slot"');
      expectOrder(slot, ['class="bg-radar"', 'data-gauge="speed"']);
      const speed = element(slot, 'data-gauge="speed"');
      expect(speed).toContain('>58<');
      expect(speed).toContain(esc(GAME_COPY[l].ride.speedUnit));
      expect(count(html, 'data-gauge="speed"')).toBe(1);
    }
  });

  it('hands the radar the heading, the clamour, the static (none while Mata is on) and the tower as the aim', () => {
    const map = (hud: Partial<HudSnapshot>) => gameHud({ hud: { radar: ITEMS, ...hud } });
    expect(element(map({ heading: 90 }), 'class="bg-radar__north"')).toContain('transform="rotate(-90 74 74)"');
    expect(element(map({ riuh: 2.5, level: 2 }), 'data-riuh-fill')).toContain('data-sweep="150"');
    expect(element(map({ riuh: 4.6, level: 4, staticFrac: 0.3 }), 'class="bg-radar__static"')).toContain('opacity:0.3');
    expect(map({ riuh: 4.6, level: 4, staticFrac: 0.3, sight: { on: true, charge: 0.5 } })).not.toContain('bg-radar__static');
    // Only a lakon that leads to the tower makes it stand out; a stop is wherever the step's circle is (Antar's is the gate).
    expect(element(map({ objective: 'tower' }), 'data-kind="tower"')).toContain('data-aim');
    for (const objective of ['stop', 'collect', 'roam', 'gate'] as const) expect(map({ objective }), objective).not.toContain('data-aim');
  });

  it('a real snapshot: as many record marks as the snapshot has records, the clamped ones marked so, in both locales', () => {
    // The prologue's arrows ring the tower: from the start the near ones are in range and the far ones on the rim; from
    // the Hastinapura gate all of them are on the rim.
    const poses = [null, { x: ANCHORS.gate.x - 12, z: ANCHORS.gate.z, yaw: Math.PI }];
    const records = poses.flatMap((at) => realSnap(0, at).radar.filter((i) => i.kind === 'record'));
    expect(records.some((i) => i.clamped)).toBe(true);
    expect(records.some((i) => !i.clamped)).toBe(true);
    for (const at of poses) {
      const hud = realSnap(0, at);
      const records = hud.radar.filter((i) => i.kind === 'record');
      expect(records.length).toBeGreaterThan(0);
      for (const l of LOCALES) {
        const map = element(gameHud({ locale: l, hud }), 'role="img"');
        expect(count(map, 'data-kind="record"')).toBe(records.length);
        const marks = [...map.matchAll(/<g[^>]*data-kind="record"[^>]*>/g)].map((m) => m[0]);
        expect(marks.filter((g) => g.includes('data-clamped')).length).toBe(records.filter((i) => i.clamped).length);
        expect(count(map, 'data-clamped')).toBe(hud.radar.filter((i) => i.clamped).length);
        expect(count(map, 'data-kind=')).toBe(hud.radar.length);
      }
    }
  });

  it('each ring sweeps 360° times its fill, and lights when Laju is ready or Mata is on', () => {
    const ring = (hud: Partial<HudSnapshot>, kind: 'surge' | 'sight') => element(gameHud({ hud }), `data-ring="${kind}"`);
    expect(ring({ surge: { ready: false, frac: 0.5 } }, 'surge')).toContain('data-sweep="180"');
    expect(ring({ surge: { ready: true, frac: 1 } }, 'surge')).toContain('data-sweep="360"');
    expect(ring({ sight: { on: false, charge: 0.25 } }, 'sight')).toContain('data-sweep="90"');
    expect(ring({ sight: { on: false, charge: 0 } }, 'sight')).toContain('data-sweep="0"');
    expect(ring({ surge: { ready: true, frac: 1 } }, 'surge')).toContain('data-lit');
    expect(ring({ surge: { ready: false, frac: 0.5 } }, 'surge')).not.toContain('data-lit');
    expect(ring({ sight: { on: true, charge: 0.6 } }, 'sight')).toContain('data-lit');
    expect(ring({ sight: { on: false, charge: 0.6 } }, 'sight')).not.toContain('data-lit');
    // A meter for assistive technology: its value in percent, its name from the copy.
    const sight = ring({ sight: { on: false, charge: 0.25 } }, 'sight');
    expect(sight).toContain('role="meter"');
    expect(sight).toContain('aria-valuenow="25"');
    expect(sight).toContain(`aria-label="${esc(GAME_COPY.id.ride.sight)}"`);
  });

  it('the pause button is pressed while paused; the full-screen button only where the browser allows it', () => {
    const c = GAME_COPY.en;
    expect(gameHud({ locale: 'en', paused: true })).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Pause<\/button>/);
    expect(gameHud({ locale: 'en' })).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Pause<\/button>/);
    expect(gameHud({ locale: 'en', canFullscreen: false })).not.toContain(esc(c.fullscreen));
    expect(count(gameHud({ locale: 'en', canFullscreen: false }), '<button')).toBe(1);
    expect(gameHud({ locale: 'en', fullscreen: true })).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Full screen<\/button>/);
  });

  it('each objective has its line, none for none, and the frame line stays', () => {
    for (const l of LOCALES) {
      const o = GAME_COPY[l].objectives;
      const line: Partial<Record<ObjectiveKey, string>> = {
        roam: o.roam, prologue: o.prologue({ done: 2, total: 8 }), collect: o.collect({ done: 2, total: 8 }), tower: o.tower,
        gate: o.gate, course: o.course({ done: 2, total: 8 }), laps: o.laps({ n: 1 }), stop: o.stop,
      };
      for (const key of OBJECTIVES) {
        const html = gameHud({ locale: l, hud: { objective: key } });
        expect(html, key).toContain(esc(GAME_COPY[l].hudFrame));
        const want = line[key];
        if (key === 'none') expect(html, key).not.toContain('bg-objective__line');
        else expect(element(html, 'class="bg-objective__line"'), key).toBe(`<p class="bg-objective__line">${esc(want!)}</p>`);
      }
    }
  });

  it('the gate, the course with its count and the laps with the lap number, in both locales', () => {
    for (const l of LOCALES) {
      const o = GAME_COPY[l].objectives;
      const line = (hud: Partial<HudSnapshot>) => element(gameHud({ locale: l, hud }), 'class="bg-objective__line"');
      expect(line({ objective: 'gate', type: 'antar', done: 1, total: 2 })).toContain(esc(o.gate));
      expect(line({ objective: 'course', type: 'lintasan', done: 3, total: 9 })).toContain(esc(o.course({ done: 3, total: 9 })));
      expect(o.course({ done: 3, total: 9 })).toContain('3/9');
      expect(line({ objective: 'laps', type: 'uji', lap: 2 })).toContain(esc(o.laps({ n: 2 })));
      expect(o.laps({ n: 2 })).toMatch(/\b2\b/);
      // No lap number yet reads as the first lap.
      expect(line({ objective: 'laps', type: 'uji', lap: null })).toContain(esc(o.laps({ n: 1 })));
    }
  });

  it('for every chapter and type, in both locales, it holds no terlapor name and no event title', () => {
    /** Every parva event title, from parvaEvents, in Indonesian and English. */
    const titles = PARVAS.flatMap((p) => parvaEvents(p)).flatMap((e) => [e.title, localizeEvent(e, 'en').title]);
    expect(titles).toHaveLength(2 * game.events.flat().length);
    const types: MissionType[] = ['himpun', 'antar', 'lintasan', 'uji'];
    const quiet: GameEvent[] = [
      { type: 'filed' }, { type: 'rewriteTaken' }, { type: 'held' }, { type: 'checkpoint' }, { type: 'wall' },
      { type: 'gate', real: false, day: 3 }, { type: 'letter' }, { type: 'lap', n: 2, seconds: 48.6, matched: true },
    ];
    let rendered = 0;
    for (const l of LOCALES) {
      for (let chapter = 0; chapter < CHAPTER_TYPES.length; chapter++) {
        const cards = game.events[chapter];
        const total = chapter === 0 ? game.prologue.length : cards.length;
        const cardOf = (card: number) => (cards[card] ? { date: cards[card].dateLabel[l], channel: cards[card].channel[l] } : null);
        const records: GameEvent[] = Array.from({ length: total }, (_, k) => ({ type: 'recorded', id: `r${k}`, card: k, n: k + 1, total }));
        const toasts = [...records, ...quiet].flatMap((e, id) => {
          const text = toastText(e, l, chapter, cardOf);
          return text === null ? [] : [{ id, text }];
        });
        for (const type of new Set<MissionType>([CHAPTER_TYPES[chapter], ...types])) {
          for (const [k, objective] of OBJECTIVES.entries()) {
            for (const touch of [false, true]) {
              const html = gameHud({
                locale: l, touch, toasts,
                hud: { chapter, type, objective, done: Math.min(2, total), total, timer: 90 + k, hint: HINTS[k % HINTS.length] },
              });
              for (const n of NAMES) expect(html, `${n}: ${l} chapter ${chapter} ${type}`).not.toContain(esc(n));
              for (const t of titles) expect(html, `${t}: ${l} chapter ${chapter} ${type}`).not.toContain(esc(t));
              rendered++;
            }
          }
        }
      }
    }
    expect(rendered).toBe(2 * 9 * 4 * OBJECTIVES.length * 2);
  }, 30_000);
});

describe('Radar', () => {
  const radar = (o: Partial<RadarProps> = {}) =>
    renderToString(<Radar locale="id" items={ITEMS} riuh={0} staticFrac={0} size={RADAR_PX} m={70} heading={0} sight={false} {...o} />);
  /** The static band, or null when none is drawn. */
  const band = (o: Partial<RadarProps>) => {
    const html = radar(o);
    return html.includes('bg-radar__static') ? element(html, 'class="bg-radar__static"') : null;
  };
  /** The radius of the clip path on a group (the ranks' by default, or the route's), and the group it clips. */
  function edgeClip(html: string, cls = 'bg-radar__edge'): { r: number; group: string } {
    const group = element(html, `class="${cls}"`);
    const id = /clip-path="url\(#([^)]+)\)"/.exec(group)![1];
    const r = new RegExp(`<clipPath id="${id}"><circle cx="${C}" cy="${C}" r="([\\d.]+)"`).exec(html)![1];
    return { r: Number(r), group };
  }
  /** The start and end of an arc path, in degrees clockwise from the top; the end is null for a bare move. */
  function arcEnds(d: string): { from: number; to: number | null; large: boolean } {
    const deg = (x: number, y: number) => ((Math.atan2(x - C, C - y) * 180) / Math.PI + 360) % 360;
    const m = /^M([\d.-]+) ([\d.-]+)(?:A([\d.]+) ([\d.]+) 0 ([01]) 1 ([\d.-]+) ([\d.-]+))?$/.exec(d)!;
    return { from: deg(+m[1], +m[2]), to: m[6] === undefined ? null : deg(+m[6], +m[7]), large: m[5] === '1' };
  }
  const pathD = (el: string) => / d="([^"]+)"/.exec(el)![1];

  it('the map is an img on the square, labelled with the range from the copy, holding a mark per item by kind', () => {
    for (const l of LOCALES) {
      const html = radar({ locale: l, m: 96 });
      expect(html).toMatch(/^<div class="bg-radar">/);
      const map = element(html, 'role="img"');
      expect(map).toMatch(/^<svg class="bg-radar__map" role="img"/);
      expect(map).toContain(`aria-label="${esc(GAME_COPY[l].ride.radar({ m: 96 }))}"`);
      expect(map).toContain(`viewBox="0 0 ${RADAR_PX} ${RADAR_PX}"`);
      for (const kind of KINDS) expect(count(map, `data-kind="${kind}"`), kind).toBe(ITEMS.filter((i) => i.kind === kind).length);
      expect(count(map, 'data-clamped')).toBe(ITEMS.filter((i) => i.clamped).length);
      const records = [...map.matchAll(/<g[^>]*data-kind="record"[^>]*>/g)].map((m) => m[0]);
      expect(records.map((g) => g.includes('data-clamped'))).toEqual([false, true]);
    }
  });

  it('draws in radar.ts\'s order: the ranks in their clip, the shelters, the route in its clip, then copies, tower, replays and the lakon\'s targets', () => {
    const html = radar();
    const order = [...html.matchAll(/data-kind="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['ranks', 'shelter', 'shelter', 'route', 'decoy', 'tower', 'replay', 'marker', 'record', 'record', 'gate', 'post', 'post']);
    // The ranks alone in theirs, the route alone in its own, the shelters between the two in neither.
    const ranks = edgeClip(html).group;
    const route = edgeClip(html, 'bg-radar__route').group;
    expect([...ranks.matchAll(/data-kind="(\w+)"/g)].map((m) => m[1])).toEqual(['ranks']);
    expect([...route.matchAll(/data-kind="(\w+)"/g)].map((m) => m[1])).toEqual(['route']);
    expect(html.indexOf(ranks) + ranks.length).toBeLessThan(html.indexOf('data-kind="shelter"'));
    expect(html.lastIndexOf('data-kind="shelter"')).toBeLessThan(html.indexOf(route));
    // The next lap post is the brighter one.
    const posts = [...radar().matchAll(/<g[^>]*data-kind="post"[^>]*>/g)].map((m) => m[0]);
    expect(posts.map((g) => g.includes('data-next'))).toEqual([true, false]);
  });

  it('only the ranks and the route are clipped: no other mark, the shelters among them, sits inside a clip-path', () => {
    /** Each mark's kind, and whether it or a group around it carries a clip-path. */
    const marks = (html: string) => {
      const out: { kind: string; clipped: boolean }[] = [];
      const open: boolean[] = [];
      for (const [, close, attrs, self] of html.matchAll(/<(\/?)[a-zA-Z]+([^>]*?)(\/?)>/g)) {
        if (close) {
          open.pop();
          continue;
        }
        const clips = attrs.includes('clip-path=');
        const kind = /data-kind="(\w+)"/.exec(attrs)?.[1];
        if (kind) out.push({ kind, clipped: clips || open.some(Boolean) });
        if (!self) open.push(clips);
      }
      return out;
    };
    for (const o of [{}, { staticFrac: 0.3 }, { staticFrac: 0.45, sight: true }]) {
      const drawn = marks(radar(o));
      expect(drawn.map((d) => d.kind)).toEqual(['ranks', 'shelter', 'shelter', 'route', 'decoy', 'tower', 'replay', 'marker', 'record', 'record', 'gate', 'post', 'post']);
      for (const d of drawn) expect(d.clipped, d.kind).toBe(d.kind === 'ranks' || d.kind === 'route');
    }
  });

  it('the route is drawn in its own clip, ROUTE_OVERHANG past the ranks\' at the radius shown, never further', () => {
    expect(ROUTE_OVERHANG).toBeLessThanOrEqual(4);
    for (const [o, fog] of [[{}, 0], [{ staticFrac: 0.3 }, 0.3], [{ staticFrac: 0.45, sight: true }, 0]] as const) {
      const html = radar(o);
      const ranks = edgeClip(html);
      const route = edgeClip(html, 'bg-radar__route');
      expect(ranks.r).toBeCloseTo(R * (1 - fog), 1);
      expect(route.r).toBeCloseTo(R * (1 - fog) + ROUTE_OVERHANG, 1);
      expect(count(route.group, 'data-kind="route"')).toBe(1);
      expect(count(ranks.group, 'data-kind="ranks"')).toBe(1);
      expect(count(html, 'data-kind="route"')).toBe(1);
    }
  });

  it('the tower stands out only while the lakon leads to it, never at a stop: not at Antar\'s gate', () => {
    const at = { x: ANCHORS.gate.x, z: ANCHORS.gate.z, yaw: Math.PI };
    const draw = (hud: HudSnapshot) =>
      renderToString(<Radar locale="en" items={hud.radar} riuh={hud.riuh} staticFrac={hud.staticFrac} size={RADAR_PX} m={70} heading={hud.heading} sight={false} objective={hud.objective} />);
    // Antar (chapter 2), step 1: the letter at the Hastinapura gate. In the gate's circle the objective is 'stop'.
    const stop = realSnap(2, at, { step: 1 });
    expect(stop.objective).toBe('stop');
    expect(stop.radar.some((i) => i.kind === 'tower')).toBe(true);
    const plain = draw(stop);
    expect(plain).not.toContain('data-aim');
    expect(plain).not.toContain('bg-radar__halo');
    // Its last step leads to the tower: from the same place the objective is 'tower', and the tower has its halo.
    const tower = realSnap(2, at, { step: 3 });
    expect(tower.objective).toBe('tower');
    const aimed = draw(tower);
    expect(element(aimed, 'data-kind="tower"')).toContain('data-aim');
    expect(element(element(aimed, 'data-kind="tower"'), 'class="bg-radar__halo"')).toBeTruthy();
  });

  it('the clamour is a meter from 0 to 5: its value to one decimal, its name and its level from the copy', () => {
    for (const l of LOCALES) {
      const c = GAME_COPY[l].ride;
      const meter = element(radar({ locale: l, riuh: 2.54 }), 'role="meter"');
      expect(meter).toMatch(/^<div class="bg-riuh" role="meter"/);
      for (const a of ['aria-valuemin="0"', 'aria-valuemax="5"', 'aria-valuenow="2.5"', `aria-label="${esc(c.riuh)}"`]) expect(meter, a).toContain(a);
      expect(meter).toContain(`aria-valuetext="${esc(c.riuhLevel({ n: 2 }))}"`);
      expect(element(radar({ locale: l, riuh: 4.96 }), 'role="meter"')).toContain(`aria-valuetext="${esc(c.riuhLevel({ n: 4 }))}"`);
    }
    const now = (riuh: number) => /aria-valuenow="([^"]+)"/.exec(element(radar({ riuh }), 'role="meter"'))![1];
    expect([now(0), now(3), now(4.96), now(5), now(7), now(-1), now(Number.NaN)]).toEqual(['0', '3', '5', '5', '5', '0', '0']);
    expect(element(radar({ riuh: 7 }), 'role="meter"')).toContain(`aria-valuetext="${esc(GAME_COPY.id.ride.riuhLevel({ n: 5 }))}"`);
  });

  it('one continuous arc: a 300° track and one fill path whose sweep is 300·riuh/5 degrees, never in segments', () => {
    expect(element(radar({ riuh: 2.5 }), 'data-riuh-fill')).toContain('data-sweep="150"');
    for (const [riuh, sweep] of [[0, 0], [1.25, 75], [3.3, 198], [5, 300], [9, 300]] as const) {
      expect(element(radar({ riuh }), 'data-riuh-fill'), String(riuh)).toContain(`data-sweep="${sweep}"`);
    }
    const html = radar({ riuh: 2.5 });
    const meter = element(html, 'role="meter"');
    expect(count(meter, 'data-riuh-fill')).toBe(1);
    expect(count(meter, '<path')).toBe(2);
    // The track runs clockwise from 210° (low on the left) round the top to 150°: 300°, the gap of 60° under the chariot.
    const track = arcEnds(pathD(element(meter, 'class="bg-riuh__track"')));
    expect(track.from).toBeCloseTo(210, 1);
    expect(track.to!).toBeCloseTo(150, 1);
    expect(track.large).toBe(true);
    // The fill starts where the track does; at 2.5 it ends at the top (150° on), at 5 where the track ends.
    const fill = (riuh: number) => arcEnds(pathD(element(radar({ riuh }), 'data-riuh-fill')));
    expect(fill(2.5).from).toBeCloseTo(210, 1);
    expect(fill(2.5).to!).toBeCloseTo(0, 1);
    expect(fill(5).to!).toBeCloseTo(150, 1);
    expect(fill(1).to!).toBeCloseTo(270, 1);
    expect(fill(0).to).toBeNull();
    for (const riuh of [0, 2.5, 5]) expect(radar({ riuh })).not.toContain('data-segment');
    expect(arcPath(C, 70, 210, 300)).toBe(pathD(element(meter, 'class="bg-riuh__track"')));
  });

  it('the static: a still noise band over the outer staticFrac of the disc, at that opacity, and none while Mata is on', () => {
    expect(band({ staticFrac: 0 })).toBeNull();
    // Drawn as a stroke on the rim, clipped to the disc: twice the band's width, so its inner edge is at 66·(1 − f).
    const four = band({ staticFrac: 0.3 })!;
    expect(four).toContain('style="stroke-width:39.6;opacity:0.3"');
    expect(four).toMatch(/stroke="url\(#[^)]+\)"/);
    expect(band({ staticFrac: 0.45 })).toContain('style="stroke-width:59.4;opacity:0.45"');
    expect(band({ staticFrac: 0.45, sight: true })).toBeNull();
    // Still: the same grains every time it is drawn from the same seed, and nothing in it moves on its own.
    expect(radar({ staticFrac: 0.3 })).toBe(radar({ staticFrac: 0.3 }));
    expect(noiseGrains(7)).toEqual(noiseGrains(7));
    expect(noiseGrains(7)).not.toEqual(noiseGrains(8));
    const html = radar({ staticFrac: 0.45 });
    expect(html).not.toMatch(/<animate|<set\b/);
    const grains = noiseGrains(1);
    expect(count(element(html, '<pattern'), 'class="bg-radar__grain"')).toBe(grains.length);
    // Redrawn at most twice a second, from one interval, and never under reduced motion.
    expect(STATIC_MS).toBeGreaterThanOrEqual(500);
    const src = readFileSync('src/components/bowobharata-game/Radar.tsx', 'utf8');
    expect(src.match(/setInterval\(/g)).toHaveLength(1);
    expect(src).toMatch(/setInterval\([^;]*,\s*STATIC_MS\)/);
    expect(src).toContain("'(prefers-reduced-motion: reduce)'");
    expect(src).not.toMatch(/Math\.random|Date\.now/);
  });

  it('the ranks: clipped to the visible radius, so nothing leaves the disc or shows in the static unless Mata is on', () => {
    // The disc's radius is radar.ts's inner radius: where a far place is clamped.
    const far = radarPoint({ x: 0, z: -5000 }, { x: 0, z: 0, yaw: Math.PI / 2 }, 70, RADAR_PX);
    expect(Math.hypot(far.x - C, far.y - C)).toBeCloseTo(R, 9);
    expect(edgeClip(radar()).r).toBe(R);
    expect(edgeClip(radar({ staticFrac: 0.3 })).r).toBeCloseTo(R * 0.7, 9);
    expect(edgeClip(radar({ staticFrac: 0.45 })).r).toBeCloseTo(R * 0.55, 9);
    expect(edgeClip(radar({ staticFrac: 0.45, sight: true })).r).toBe(R);
    // In depth: radar.ts cuts the outline itself, but an item out of that contract (corners past the disc, the anchor
    // clamped to the rim) is still held. Every ranks mark sits in the group, as its outline, nothing drawn at its anchor.
    const html = radar({ staticFrac: 0.3 });
    const { group } = edgeClip(html);
    expect(count(html, 'data-kind="ranks"')).toBe(1);
    const mark = element(group, 'data-kind="ranks"');
    expect(mark).toContain('<polygon points="96,4 196,4 196,70 96,70"');
    expect(mark).not.toContain('<circle');
    // A block given no outline (a round one) is a spot in the same group, so the clip holds it too.
    const bare: RadarItem = { kind: 'ranks', ...rim(300), clamped: true, dist: 3 };
    const lone = renderToString(<Radar locale="en" items={[bare]} riuh={4.2} staticFrac={0.3} size={RADAR_PX} m={70} heading={0} sight={false} />);
    expect(count(edgeClip(lone).group, 'data-kind="ranks"')).toBe(1);
    expect(element(edgeClip(lone).group, 'data-kind="ranks"')).toContain('<circle');
    expect(count(lone, 'data-kind="ranks"')).toBe(1);
  });

  it('agrees with radar.ts: real ranks come anchored inside and cut to the radius shown, so at rest the clip cuts nothing', () => {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    // At rest 7 m off the Kurawa block: level 4 with Mata off and on, level 5, and calm.
    const cases = [[4.2, false, R * 0.7], [4.2, true, R], [5, false, R * 0.55], [0, false, R]] as const;
    for (const [riuh, sight, radius] of cases) {
      const hud = realSnap(1, BY_RANKS, { riuh, sight });
      const ranks = hud.radar.filter((i) => i.kind === 'ranks');
      expect(ranks.length, `${riuh} ${sight}`).toBeGreaterThan(0);
      const html = renderToString(
        <Radar locale="id" items={hud.radar} riuh={hud.riuh} staticFrac={hud.staticFrac} size={RADAR_PX} m={70} heading={hud.heading} sight={sight} />,
      );
      const clip = edgeClip(html);
      expect(clip.r, `${riuh} ${sight}`).toBeCloseTo(radius, 9);
      for (const k of ranks) {
        expect(k.clamped).toBe(false);
        expect(Math.hypot(k.x - C, k.y - C)).toBeLessThanOrEqual(clip.r + 0.01);
        for (const p of k.points ?? []) expect(Math.hypot(p.x - C, p.y - C)).toBeLessThanOrEqual(clip.r + 0.01);
      }
      // Drawn as they come: one polygon per outline of 3 points or more, with the data's own points.
      const polygons = [...clip.group.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]);
      const outlines = ranks.filter((k) => (k.points?.length ?? 0) >= 3).map((k) => k.points!.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' '));
      expect(outlines.length).toBeGreaterThan(0);
      expect(polygons).toEqual(outlines);
    }
    // A block that just touches the edge comes with fewer than 3 points: it draws nothing.
    const touching: RadarItem = { kind: 'ranks', x: C, y: C - R * 0.7, clamped: false, dist: 49, points: [{ x: C, y: C - R * 0.7 }] };
    const html = renderToString(<Radar locale="en" items={[touching]} riuh={4.2} staticFrac={0.3} size={RADAR_PX} m={70} heading={0} sight={false} />);
    const mark = element(edgeClip(html).group, 'data-kind="ranks"');
    expect(mark).not.toMatch(/<polygon|<circle|<path/);
  });

  it('the north petal turns with the heading, and its letter, from the copy, stays upright on it', () => {
    for (const l of LOCALES) {
      const at = (heading: number) => radar({ locale: l, heading });
      expect(element(at(0), 'class="bg-radar__north"')).toContain(`transform="rotate(0 ${C} ${C})"`);
      expect(element(at(90), 'class="bg-radar__north"')).toContain(`transform="rotate(-90 ${C} ${C})"`);
      expect(element(at(225), 'class="bg-radar__north"')).toContain(`transform="rotate(-225 ${C} ${C})"`);
      const letter = (heading: number) => {
        const m = /<text class="bg-radar__letter" x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/.exec(at(heading))!;
        return { x: +m[1], y: +m[2], text: m[3] };
      };
      expect(letter(0).text).toBe(esc(GAME_COPY[l].ride.north));
      // Facing north it is at the top; facing east, north lies to the left; facing south, at the bottom.
      expect(letter(0).x).toBeCloseTo(C, 1);
      expect(letter(0).y).toBeLessThan(C - R + 4);
      expect(letter(90).x).toBeLessThan(C - R + 4);
      expect(letter(90).y).toBeCloseTo(C, 1);
      expect(letter(180).y).toBeGreaterThan(C + R - 4);
      expect(element(at(90), 'class="bg-radar__north"')).not.toContain('<text');
    }
  });

  it('holds no dossier content: no word but the north letter and the clamour\'s name, no title, and labels from the copy', () => {
    for (const l of LOCALES) {
      const c = GAME_COPY[l].ride;
      for (const o of [{}, { staticFrac: 0.45, riuh: 5 }, { sight: true, riuh: 3.2, objective: 'tower' as const, heading: 200 }]) {
        const html = radar({ locale: l, ...o });
        const words = [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean);
        expect(words.sort()).toEqual([esc(c.north), esc(c.riuh)].sort());
        expect(html).not.toMatch(/<title|<desc/);
        const labels = [...html.matchAll(/aria-(?:label|valuetext)="([^"]*)"/g)].map((m) => m[1]).sort();
        expect(labels).toEqual([esc(c.radar({ m: 70 })), esc(c.riuh), esc(c.riuhLevel({ n: Math.floor(o.riuh ?? 0) }))].sort());
        for (const n of NAMES) expect(html).not.toContain(esc(n));
        for (const t of TITLES) expect(html).not.toContain(esc(t));
      }
    }
  });

  it('takes its colours from the CSS: no colour written in the markup', () => {
    const html = radar({ staticFrac: 0.3, riuh: 4.4, objective: 'stop' });
    expect(html).not.toMatch(/\s(?:fill|stroke|color|stop-color)="(?!none"|url\()/);
    expect(html).not.toMatch(/style="[^"]*(?:fill|stroke:|color)/);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe('Radar fades and eases (the model behind it)', () => {
  const rec = (x: number, y = 74, clamped = false): RadarItem => ({ kind: 'record', x, y, clamped, dist: 10 });
  const opacities = (m: RadarModel) => new Map(m.marks.map((k) => [k.key, markOpacity(k, m.now)]));
  const isEdge = (i: RadarItem) => i.kind === 'ranks' || i.kind === 'route';
  /** How far out (px from the centre) a mark's outline or line reaches. */
  const reach = (i: RadarItem) => Math.max(...(i.points ?? [i]).map((p) => Math.hypot(p.x - C, p.y - C)));
  /** The map model's inputs from a snapshot, as the Radar takes them. */
  const inputs = (h: HudSnapshot) => [h.radar, fogFor(h.staticFrac, h.sight.on), h.objective === 'tower'] as const;
  /** The cut shapes a view draws, each in its clip: the ranks' outlines and the route. */
  const edgeOf = (v: MapView) => [...v.ranks, ...v.route];
  /** The radius of a cut shape's clip: the route's reaches ROUTE_OVERHANG past the ranks'. */
  const clipOf = (v: MapView, d: Drawn) => (d.mark.item.kind === 'route' ? v.routeClip : v.clip);

  /**
   * Runs the map model on a 16 ms frame clock from the first snapshot's time to `until`, taking each later snapshot at
   * its time, and checks every frame against the one before:
   * - a ranks or route mark comes in at opacity 0 and leaves only at 0, and no mark's opacity moves faster than one
   *   full fade per FADE_MS;
   * - while a mark is seen in both frames its shape never changes (the chariot is at rest, so only a cut could change it);
   * - every ranks mark is drawn in the clip, whose radius is the shown static's inner edge and moves no faster than the
   *   static's ease, and the route in its own clip ROUTE_OVERHANG further out.
   */
  function run(snaps: { at: number; hud: HudSnapshot }[], until: number): { m: RadarModel; views: MapView[] } {
    let m = radarModel(...inputs(snaps[0].hud), snaps[0].at);
    let prev = mapView(m, RADAR_PX);
    const views = [prev];
    let next = 1;
    for (let t = snaps[0].at + 16; t <= until; t += 16) {
      while (next < snaps.length && snaps[next].at <= t) m = stepModel(m, ...inputs(snaps[next++].hud), t);
      m = tickModel(m, t);
      const view = mapView(m, RADAR_PX);
      const step = 16 / FADE_MS + 1e-9;
      const was = new Map(edgeOf(prev).map((d) => [d.mark.key, d]));
      for (const d of edgeOf(view)) {
        const p = was.get(d.mark.key);
        expect(Math.abs(d.opacity - (p?.opacity ?? 0)), `t ${t} key ${d.mark.key}`).toBeLessThanOrEqual(step);
        if (p && p.opacity > 0 && d.opacity > 0) expect(d.mark.item.points, `t ${t} key ${d.mark.key}`).toEqual(p.mark.item.points);
      }
      const keys = new Set(edgeOf(view).map((d) => d.mark.key));
      for (const p of edgeOf(prev)) if (!keys.has(p.mark.key)) expect(p.opacity, `t ${t} key ${p.mark.key} left`).toBeLessThanOrEqual(step);
      expect([...view.shelters, ...view.points].some((d) => isEdge(d.mark.item))).toBe(false);
      expect(view.ranks.every((d) => d.mark.item.kind === 'ranks') && view.route.every((d) => d.mark.item.kind === 'route')).toBe(true);
      expect(view.clip).toBeCloseTo(R * (1 - easedAt(m.fog, m.now)), 1);
      expect(view.routeClip).toBeCloseTo(view.clip + ROUTE_OVERHANG, 1);
      expect(Math.abs(view.clip - prev.clip), `t ${t} clip`).toBeLessThanOrEqual((R * 0.45 * 16) / EASE_MS + 0.011);
      views.push(view);
      prev = view;
    }
    return { m, views };
  }
  /** At rest: nothing in the static band, the clip at the radius shown, no mark on its way. */
  function expectAtRest(m: RadarModel, fog: number) {
    expect(modelBusy(m)).toBe(false);
    const v = mapView(m, RADAR_PX);
    expect(v.clip).toBeCloseTo(R * (1 - fog), 1);
    for (const d of edgeOf(v)) {
      expect(d.opacity).toBe(1);
      expect(reach(d.mark.item)).toBeLessThanOrEqual(v.clip + 0.01);
    }
  }

  it('fades over at least a quarter second: FADE_MS and EASE_MS', () => {
    expect(FADE_MS).toBeGreaterThanOrEqual(250);
    expect(EASE_MS).toBeGreaterThanOrEqual(250);
  });

  it('the first view shows its items at once and the static at its value, and is still', () => {
    const m = radarModel(ITEMS, 0.3, false);
    expect(m.marks.map((k) => k.item)).toEqual(ITEMS);
    expect([...opacities(m).values()].every((o) => o === 1)).toBe(true);
    expect(easedAt(m.fog, m.now)).toBe(0.3);
    expect(modelBusy(m)).toBe(false);
    // Mata sees through the static: none is shown while it is on.
    expect([fogFor(0.3, false), fogFor(0.3, true), fogFor(0.45, false), fogFor(Number.NaN, false)]).toEqual([0.3, 0, 0.45, 0]);
  });

  it('a mark keeps its key while its item moves; a new item fades in and a gone one fades out, both at one fade per FADE_MS', () => {
    let m = radarModel([rec(40), rec(100)], 0, false);
    const [a, b] = m.marks.map((k) => k.key);
    m = stepModel(m, [rec(43, 75), rec(70, 30)], 0, false, 1000);
    // The first moved 3 px: the same mark, at full. The second vanished; a new one came at (70, 30).
    expect(m.marks.find((k) => k.key === a)!.item.x).toBe(43);
    expect(markOpacity(m.marks.find((k) => k.key === a)!, 1000)).toBe(1);
    const fresh = m.marks.find((k) => k.key !== a && k.key !== b)!;
    expect(fresh.item).toEqual(rec(70, 30));
    expect(markOpacity(fresh, 1000)).toBe(0);
    expect(markOpacity(fresh, 1000 + FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(markOpacity(fresh, 1000 + FADE_MS)).toBe(1);
    const gone = m.marks.find((k) => k.key === b)!;
    expect(gone.item).toEqual(rec(100));
    expect(markOpacity(gone, 1000)).toBe(1);
    expect(markOpacity(gone, 1000 + FADE_MS / 4)).toBeCloseTo(0.75, 9);
    expect(modelBusy(m)).toBe(true);
    // Once faded out it leaves the model; until then the frame clock keeps it, and once settled no frame is asked for.
    expect(tickModel(m, 1000 + FADE_MS - 1).marks.some((k) => k.key === b)).toBe(true);
    const done = tickModel(m, 1000 + FADE_MS);
    expect(done.marks.some((k) => k.key === b)).toBe(false);
    expect(modelBusy(done)).toBe(false);
  });

  it('a mark that comes back fades back in from where it was, and the route stays one mark however far its end moves', () => {
    let m = radarModel([rec(40)], 0, false);
    const key = m.marks[0].key;
    m = stepModel(m, [], 0, false, 1000);
    m = stepModel(m, [rec(41)], 0, false, 1000 + FADE_MS * 0.6);
    const back = m.marks.find((k) => k.key === key)!;
    expect(markOpacity(back, m.now)).toBeCloseTo(0.4, 9);
    expect(markOpacity(back, m.now + FADE_MS * 0.3)).toBeCloseTo(0.7, 9);
    const route = (x: number): RadarItem => ({ kind: 'route', x, y: 10, clamped: true, dist: 300, points: [{ x: 74, y: 74 }, { x, y: 10 }] });
    let r = radarModel([route(20)], 0, false);
    r = stepModel(r, [route(130)], 0, false, 500);
    expect(r.marks).toHaveLength(1);
    expect(r.marks[0].key).toBe(0);
    expect(markOpacity(r.marks[0], 500)).toBe(1);
  });

  it('whatever the snapshots do, no mark appears, changes or leaves faster than one full fade per FADE_MS', () => {
    const rand = mulberry32(17);
    let m = radarModel([], 0, false);
    const seen = new Map<number, { t: number; o: number }>();
    let t = 2000;
    let checked = 0;
    for (let k = 0; k < 600; k++) {
      t += 4 + Math.floor(rand() * 70);
      if (rand() < 0.6) {
        // Up to six records that jitter by a pixel or two, come, go, come back near where they were, and touch the rim.
        const items = Array.from({ length: Math.floor(rand() * 7) }, (_, i) => rec(18 + i * 19 + rand() * 2, 74 + rand() * 2, rand() < 0.3));
        m = stepModel(m, rand() < 0.5 ? items : items.reverse(), rand() < 0.2 ? 0.3 : 0, rand() < 0.1, t);
      } else m = tickModel(m, t);
      const live = new Set<number>();
      for (const [key, o] of opacities(m)) {
        const prev = seen.get(key);
        const since = prev ? m.now - prev.t : m.now - m.marks.find((x) => x.key === key)!.at;
        expect(Math.abs(o - (prev ? prev.o : 0)), `key ${key}`).toBeLessThanOrEqual(since / FADE_MS + 1e-9);
        seen.set(key, { t: m.now, o });
        live.add(key);
        checked++;
      }
      for (const [key, s] of seen) {
        if (live.has(key)) continue;
        expect(s.o, `key ${key} left`).toBeLessThanOrEqual((m.now - s.t) / FADE_MS + 1e-9);
        seen.delete(key);
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('the static band and its clip ease to a new value over EASE_MS from wherever they are, never jumping', () => {
    let m = radarModel([], 0, false);
    m = stepModel(m, [], 0.3, false, 1000);
    expect(easedAt(m.fog, 1000)).toBe(0);
    expect(easedAt(m.fog, 1000 + EASE_MS / 2)).toBeCloseTo(0.15, 9);
    // Mata comes on half way: the static turns back from where it is.
    const mid = easedAt(m.fog, 1000 + EASE_MS / 2);
    m = stepModel(m, [], 0, false, 1000 + EASE_MS / 2);
    expect(easedAt(m.fog, m.now)).toBeCloseTo(mid, 9);
    expect(modelBusy(m)).toBe(true);
    expect(easedAt(m.fog, m.now + EASE_MS)).toBe(0);
    expect(modelBusy(tickModel(m, m.now + EASE_MS))).toBe(false);
    // The clock never runs back.
    expect(tickModel(m, 0).now).toBe(m.now);
    // The band and the clip follow the same eased value.
    const v = mapView(tickModel(m, m.now + EASE_MS / 5), RADAR_PX);
    expect(v.band!.width).toBeCloseTo(2 * R * v.fog, 1);
    expect(v.clip).toBeCloseTo(R * (1 - v.fog), 1);
  });

  it('trackMarks matches by kind: a record never takes over a copy\'s mark, however near', () => {
    const copy: RadarItem = { kind: 'decoy', x: 50, y: 50, clamped: false, dist: 5 };
    const { marks, next } = trackMarks(radarModel([copy], 0, false).marks, [rec(50, 50)], 100, 1);
    expect(next).toBe(2);
    expect(marks.map((k) => [k.key, k.item.kind, k.to])).toEqual([[1, 'record', 1], [0, 'decoy', 0]]);
  });

  // ── Ruling 1: the ranks and the route at the static's edge ─────────────────────────────────────────────────────────

  describe('the ranks outline and the route at the static\'s edge', () => {
    /** At rest by the Kurawa block with a route north: the clamour and Mata as given. */
    const by = (riuh: number, sight: boolean) => realSnap(1, BY_RANKS, { riuh, sight, route: NORTH_ROUTE });

    it('the scene has ranks and a route, and radar.ts cuts both at the radius shown', () => {
      for (const [riuh, sight, radius] of [[4.2, true, R], [4.2, false, R * 0.7], [3.9, false, R]] as const) {
        const h = by(riuh, sight);
        expect(h.radar.filter((i) => i.kind === 'ranks').length).toBeGreaterThan(0);
        expect(h.radar.filter((i) => i.kind === 'route')).toHaveLength(1);
        for (const i of h.radar.filter(isEdge)) expect(reach(i)).toBeLessThanOrEqual(radius + 0.01);
      }
      // With Mata on, the outline and the route reach well past the static's inner edge: those are the parts in question.
      expect(Math.max(...by(4.2, true).radar.filter(isEdge).map(reach))).toBeGreaterThan(R * 0.7 + 10);
    });

    it('Mata off: the outer outline and route stay, fading out under the clip as the static comes in, and never pop', () => {
      const { m, views } = run([{ at: 0, hud: by(4.2, true) }, { at: 1000, hud: by(4.2, false) }], 2600);
      // The first frame after the step still shows the outline and the route out as far as before, at nearly full strength.
      const i = Math.ceil(1000 / 16);
      const before = views[i - 1];
      const after = views[i];
      const far = (v: MapView, at: number) => Math.max(...edgeOf(v).filter((d) => d.opacity >= at).map((d) => Math.min(reach(d.mark.item), clipOf(v, d))));
      expect(far(after, 0.9)).toBeCloseTo(far(before, 0.9), 0);
      expect(far(before, 0.9)).toBeGreaterThan(R * 0.7 + 10);
      expectAtRest(m, 0.3);
    });

    it('Mata on: the longer outline and route come in under the clip as the static recedes, never at once', () => {
      const { m, views } = run([{ at: 0, hud: by(4.2, false) }, { at: 1000, hud: by(4.2, true) }], 2600);
      // Right after the step nothing shows past the old edge; the new parts come in with the clip.
      const after = views[Math.ceil(1000 / 16)];
      // The route's line may show its end chevron's overhang past the edge, no more.
      for (const d of edgeOf(after)) {
        expect(Math.min(reach(d.mark.item), clipOf(after, d))).toBeLessThanOrEqual(R * 0.7 + 1 + (d.mark.item.kind === 'route' ? ROUTE_OVERHANG : 0));
      }
      expectAtRest(m, 0);
    });

    it('a level step from 3 to 4 cross-fades the same way, and back from 4 to 3', () => {
      expectAtRest(run([{ at: 0, hud: by(3.9, false) }, { at: 1000, hud: by(4.2, false) }], 2600).m, 0.3);
      expectAtRest(run([{ at: 0, hud: by(4.2, false) }, { at: 1000, hud: by(3.9, false) }], 2600).m, 0);
    });

    it('keeps at most two copies of a cut shape on their way out, however fast its cut and its shape change', () => {
      // A route shown in full, then reshaped and re-cut at 200, 300, 350 and 380 ms while the chariot moves: each change
      // leaves the last shape fading out. By 350 ms three would be on their way out (the full one at 0.7, two at 0.1);
      // the faintest goes, so at most two are.
      const routeAt = (k: number, clamped: boolean): RadarItem => {
        const end = { x: 20 + k * 9, y: 10 + k * 4 };
        return { kind: 'route', ...end, clamped, dist: 300, points: [{ x: C, y: C }, end] };
      };
      let m = radarModel([routeAt(0, false)], 0, false, 0);
      const steps = [[1, 200, true, 0.3], [2, 300, false, 0.45], [3, 350, true, 0], [4, 380, false, 0.3]] as const;
      for (const [k, t, clamped, fog] of steps) {
        m = stepModel(m, [routeAt(k, clamped)], fog, false, t);
        const routes = m.marks.filter((x) => x.item.kind === 'route');
        expect(routes.filter((x) => x.to === 1), `at ${t}`).toHaveLength(1);
        expect(routes.filter((x) => x.to === 0).length, `at ${t}`).toBeLessThanOrEqual(2);
      }
      // The full one, still the strongest on its way out, is kept.
      expect(m.marks.some((x) => x.key === 0 && markOpacity(x, m.now) > 0.5)).toBe(true);
    });

    it('K tapped at 4 Hz for 2 s: never more than three marks per outline or route, and no shape or opacity ever jumps', () => {
      const on = by(4.2, true);
      const off = by(4.2, false);
      const snaps = Array.from({ length: 17 }, (_, k) => ({ at: k * 125, hud: k % 2 === 0 ? off : on }));
      const ranks = off.radar.filter((i) => i.kind === 'ranks').length;
      const { m, views } = run(snaps, 2000);
      for (const v of views) {
        expect(v.ranks.length).toBeLessThanOrEqual(3 * ranks);
        expect(v.route.length).toBeLessThanOrEqual(3);
      }
      // Then still: it settles with the last snapshot, nothing in the band.
      expectAtRest(run([...snaps, { at: 2125, hud: off }], 3400).m, 0.3);
      // In all, bounded: three marks at most per outline and route, and one per point item that Mata brings in or out.
      expect(m.marks.length).toBeLessThanOrEqual(3 * (ranks + 1) + on.radar.length + off.radar.length);
      // A copy of the cut tapped back to comes back from where it is, so each outline stays near full the whole time:
      // its marks' combined strength, 1 − Π(1 − opacity) over its copies, never sinks under 0.75.
      for (const [k, v] of views.entries()) {
        for (const key of new Set(v.ranks.map((d) => d.mark.item.key))) {
          const own = v.ranks.filter((d) => d.mark.item.key === key);
          const strength = 1 - own.reduce((x, d) => x * (1 - d.opacity), 1);
          expect(strength, `frame ${k}: ${key}`).toBeGreaterThanOrEqual(0.75);
        }
      }
    });

    it('K tapped while turning (30°/s, 90°/s) or driving (15 m/s), a snapshot every 100 ms: no route or ranks copy leaves at more than a frame\'s fade, each outline stays at 0.75 or more', () => {
      const def = missionFor(1, ['a', 'b']);
      const s0 = startChapter(def, def.start, 1, radarWorld);
      const step = 16 / FADE_MS + 1e-9;
      for (const [v, turn] of [[0, 30], [0, 90], [15, 0]] as const) {
        const what = `${v} m/s, ${turn}°/s`;
        // As the game sends them: a snapshot every 100 ms at riuh 4.2, Mata flipped every 125 ms and seen at the next one.
        let x = BY_RANKS.x;
        let z = BY_RANKS.z;
        let yaw = 0;
        const snaps: HudSnapshot[] = [];
        for (let k = 0; k < 25; k++) {
          const car = { ...initChariot(x, z, yaw), vx: v * Math.cos(yaw), vz: -v * Math.sin(yaw) };
          const sight = { ...s0.sight, on: Math.floor((k * 100) / 125) % 2 === 1 };
          snaps.push(hudOf({ ...s0, car, route: { target: 'test', points: NORTH_ROUTE }, run: { ...s0.run, phase: 'active' as const }, riuh: { ...s0.riuh, value: 4.2 }, sight }, radarWorld));
          x += v * Math.cos(yaw) * 0.1;
          z -= v * Math.sin(yaw) * 0.1;
          yaw += ((turn * Math.PI) / 180) * 0.1;
        }
        // The blocks shown in every snapshot: their outlines' combined strength is followed.
        const blocks = [...new Set(snaps[0].radar.filter((i) => i.kind === 'ranks').map((i) => i.key))].filter((key) => snaps.every((h) => h.radar.some((i) => i.key === key)));
        expect(blocks.length, what).toBeGreaterThan(0);
        expect(snaps.every((h) => h.radar.some((i) => i.kind === 'route')), what).toBe(true);
        let m = radarModel(...inputs(snaps[0]), 0);
        let prev = new Map(drawOrder(m).map((d) => [d.mark.key, d]));
        let k = 1;
        let weakest = 1;
        for (let t = 16; t <= 2400 + FADE_MS; t += 16) {
          while (k < snaps.length && k * 100 <= t) m = stepModel(m, ...inputs(snaps[k++]), t);
          m = tickModel(m, t);
          const now = new Map(drawOrder(m).map((d) => [d.mark.key, d]));
          for (const [key, p] of prev) {
            if (!now.has(key) && isEdge(p.mark.item)) expect.soft(p.opacity, `${what}, t ${t}: ${p.mark.item.kind} ${key} left`).toBeLessThanOrEqual(step);
          }
          if (t <= 2400) {
            for (const key of blocks) {
              const own = [...now.values()].filter((d) => d.mark.item.key === key);
              weakest = Math.min(weakest, 1 - own.reduce((a, d) => a * (1 - d.opacity), 1));
            }
          }
          prev = now;
        }
        expect.soft(weakest, what).toBeGreaterThanOrEqual(0.75);
      }
    });

    it('two blocks, the far one leaving with a level step and coming back with Mata: no copy leaves faster than one frame\'s fade, at 98 timings', () => {
      // At (-44, -54) at rest: the Pandawa block 26 m off, the Kurawa block 47.7 m, which only level 4's radius or Mata shows.
      const at = { x: -44, z: -54, yaw: 0 };
      const level4 = realSnap(1, at, { riuh: 4.2 });
      const level5 = realSnap(1, at, { riuh: 5 });
      const sight = realSnap(1, at, { riuh: 5, sight: true });
      expect([level4, level5, sight].map((h) => h.radar.filter((i) => i.kind === 'ranks').length)).toEqual([2, 1, 2]);
      let timings = 0;
      for (let on = 0; on <= 650; on += 50) {
        for (let off = 50; off <= 350; off += 50) {
          // The clamour reaches 5 at 1000 ms, Mata comes on `on` ms later and goes off `off` ms after that. run() checks
          // every frame: no mark leaves, comes or changes faster than one frame's fade (16 ms of FADE_MS).
          const snaps = [{ at: 0, hud: level4 }, { at: 1000, hud: level5 }, { at: 1000 + on, hud: sight }, { at: 1000 + on + off, hud: level5 }];
          const { m, views } = run(snaps, 1000 + on + off + 1200);
          for (const v of views) {
            for (const key of new Set(v.ranks.map((d) => d.mark.item.key))) expect(v.ranks.filter((d) => d.mark.item.key === key).length).toBeLessThanOrEqual(3);
          }
          expectAtRest(m, 0.45);
          timings++;
        }
      }
      expect(timings).toBe(98);
    });

    it('the route\'s end chevron and its round end are whole at rest, however the route leaves the radius shown', () => {
      // The chevron as drawn: its tip and arm ends under its transform, each with the 2 px stroke's 1 px round end.
      const reachOfChevron = (html: string) => {
        const t = /<path d="M-3 3L0 0L3 3" transform="translate\(([\d.-]+) ([\d.-]+)\) rotate\(([\d.-]+)\)"/.exec(html);
        expect(t).not.toBeNull();
        const [x, y, deg] = t!.slice(1).map(Number);
        const a = (deg * Math.PI) / 180;
        return Math.max(...[[-3, 3], [0, 0], [3, 3]].map(([px, py]) => Math.hypot(x + px * Math.cos(a) - py * Math.sin(a) - C, y + px * Math.sin(a) + py * Math.cos(a) - C) + 1));
      };
      for (const fog of [0, 0.3, 0.45]) {
        const shown = R * (1 - fog);
        for (const off of [0, 30, 45, 60, 66.7, 75, 85]) {
          // A route whose last stretch crosses the radius shown `off` degrees off the radial, cut there.
          const end = rim(0);
          const endAt = { x: C + (end.x - C) * (shown / R), y: C + (end.y - C) * (shown / R) };
          const a = ((180 - off) * Math.PI) / 180;
          const from = { x: endAt.x + 20 * Math.sin(a), y: endAt.y - 20 * Math.cos(a) };
          const route: RadarItem = { kind: 'route', ...endAt, clamped: true, dist: 300, points: [{ x: C, y: C }, from, endAt] };
          const m = radarModel([route], fog, false, 0);
          const v = mapView(m, RADAR_PX);
          const html = renderToString(<svg>{drawMark(v.route[0], C)}</svg>);
          expect(reachOfChevron(html), `fog ${fog}, ${off}° off radial`).toBeLessThanOrEqual(v.routeClip);
          expect(Math.hypot(endAt.x - C, endAt.y - C) + 1, `fog ${fog}, ${off}°: the line's round end`).toBeLessThanOrEqual(v.routeClip);
        }
      }
      // The reviewer's case: 45 m north, then east, at level 4: it leaves the radius shown about 67° off the radial.
      const real = realSnap(1, BY_RANKS, { riuh: 4.2, route: [{ x: 24, z: 20 }, { x: 24, z: -25 }, { x: 224, z: -25 }] });
      const v = mapView(radarModel(...inputs(real), 0), RADAR_PX);
      expect(v.route).toHaveLength(1);
      expect(v.route[0].mark.item.clamped).toBe(true);
      expect(reachOfChevron(renderToString(<svg>{drawMark(v.route[0], C)}</svg>))).toBeLessThanOrEqual(v.routeClip);
    });
  });

  // ── Ruling 2: only a fade or the static's ease runs the map's frames; the arc runs its own ─────────────────────────

  it('the map stays idle while only the clamour moves: 10 Hz snapshots at the decay and at the watched rate', () => {
    for (const rate of [-RIUH.decay, RIUH.watched]) {
      let m = radarModel(ITEMS, 0, false, 0);
      let arc = settled(2.5, 0);
      for (let k = 1; k <= 30; k++) {
        const t = k * 100;
        // The island's next snapshot: a new array, the items crept a little, the clamour moved at `rate`.
        const items = ITEMS.map((i) => ({ ...i, x: i.x + 0.05 * k }));
        m = stepModel(m, items, 0, false, t);
        arc = retarget(arc, 2.5 + rate * k * 0.1, t);
        for (let f = 0; f < 100; f += 16) expect(modelBusy(tickModel(m, t + f)), `${rate} at ${t + f}`).toBe(false);
        expect(arcBusy(arc, t + 16)).toBe(true);
      }
      // Once the snapshots stop, the arc settles on the last value and asks for no more frames.
      const last = 2.5 + rate * 3;
      expect(easedAt(arc, 3000 + EASE_MS)).toBeCloseTo(last, 9);
      expect(arcBusy(arc, 3000 + EASE_MS)).toBe(false);
      expect(arcBusy(arc, 3000 + EASE_MS - 1)).toBe(true);
    }
    // The arc's sweep: 300° times the clamour over 5, held to the scale.
    expect([arcSweep(2.5), arcSweep(0), arcSweep(5), arcSweep(9), arcSweep(-1), arcSweep(Number.NaN)]).toEqual([150, 0, 300, 300, 0, 0]);
  });

  it('the arc is its own small part: the map is not given the clamour, and the arc moves its one path through a ref', () => {
    const src = readFileSync('src/components/bowobharata-game/Radar.tsx', 'utf8');
    const mapProps = /const RadarMap = memo\(function RadarMap\(\{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(mapProps).not.toBe('');
    expect(mapProps).not.toMatch(/\briuh\b/);
    expect(src).toMatch(/const ClamourFill = memo\(/);
    expect(src).toMatch(/\.setAttribute\('d', /);
  });

  // ── Ruling 4 (round 2's ruling 8): the tower's halo ring fades alone ───────────────────────────────────────────────

  it('the tower\'s halo ring eases in and out over FADE_MS on its own: the tower keeps its one mark and never dips', () => {
    const tower: RadarItem = { kind: 'tower', ...rim(90), clamped: true, dist: 180 };
    let m = radarModel([tower], 0, false, 0);
    const key = m.marks[0].key;
    m = stepModel(m, [tower], 0, true, 100);
    expect(m.marks).toHaveLength(1);
    expect(m.marks[0].key).toBe(key);
    const at = (t: number) => [markOpacity(m.marks[0], t), haloOpacity(m.marks[0], t)];
    expect(at(100)).toEqual([1, 0]);
    expect(at(100 + FADE_MS / 2)[1]).toBeCloseTo(0.5, 9);
    expect(at(100 + FADE_MS)).toEqual([1, 1]);
    expect(modelBusy(tickModel(m, 100 + FADE_MS / 2))).toBe(true);
    expect(modelBusy(tickModel(m, 100 + FADE_MS))).toBe(false);
    // Released half way: the ring turns back from where it is; the tower stays at full, one mark.
    m = stepModel(m, [tower], 0, false, 100 + FADE_MS / 2);
    expect(m.marks).toHaveLength(1);
    expect(at(m.now)[0]).toBe(1);
    expect(at(m.now)[1]).toBeCloseTo(0.5, 9);
    expect(at(m.now + FADE_MS / 2)).toEqual([1, 0]);
    // Drawn: the ring at its own opacity under the tower's, the tower itself at full.
    const half = drawOrder(tickModel(m, m.now + FADE_MS / 4))[0];
    const html = renderToString(<svg>{drawMark(half, C)}</svg>);
    expect(html).not.toMatch(/<g[^>]*style="opacity/);
    expect(element(html, 'class="bg-radar__halo"')).toMatch(/style="opacity:0\.25"/);
  });

  it('a mark is drawn from itself: a tower fading out keeps its own halo and data-aim while the live one has none', () => {
    // Aimed at, then it reaches the rim (a new look) just as the aim moves on: its old mark fades out with its ring.
    const near: RadarItem = { kind: 'tower', x: C, y: C - 60, clamped: false, dist: 60 };
    const onRim: RadarItem = { ...near, y: C - R, clamped: true, dist: 75 };
    let m = radarModel([near], 0, true, 0);
    m = stepModel(m, [onRim], 0, false, 100);
    expect(m.aim).toBe(false);
    const [live, going] = drawOrder(tickModel(m, 100 + FADE_MS / 2));
    expect([live.mark.to, going.mark.to]).toEqual([1, 0]);
    const draw = (d: Drawn) => renderToString(<svg>{drawMark(d, C)}</svg>);
    expect(draw(going)).toContain('data-aim=""');
    expect(draw(going)).toContain('class="bg-radar__halo"');
    expect(draw(going)).toMatch(/<g[^>]*style="opacity:0\.5"/);
    expect(draw(live)).not.toContain('data-aim');
    expect(draw(live)).not.toContain('bg-radar__halo');
    // And the other way: the live tower is the aim, the copy on its way out was not.
    let n = radarModel([near], 0, false, 0);
    n = stepModel(n, [onRim], 0, true, 100);
    const [aimed, plain] = drawOrder(tickModel(n, 100 + FADE_MS / 2));
    expect(draw(aimed)).toContain('data-aim=""');
    expect(draw(plain)).not.toContain('data-aim');
    expect(draw(plain)).not.toContain('bg-radar__halo');
  });

  // ── Ruling 5: a mark that changes its look cross-fades ─────────────────────────────────────────────────────────────

  it('a record turning into a rim chevron and a shelter shrinking at the range edge cross-fade, and never make more than two marks', () => {
    for (const kind of ['record', 'shelter'] as const) {
      const inside: RadarItem = { kind, x: C, y: C - 65, clamped: false, dist: 69 };
      const onRim: RadarItem = { ...inside, y: C - R, clamped: true, dist: 71 };
      let m = radarModel([inside], 0, false, 0);
      m = stepModel(m, [onRim], 0, false, 100);
      const out = m.marks.find((k) => !k.item.clamped)!;
      const into = m.marks.find((k) => k.item.clamped)!;
      expect([markOpacity(out, 100), markOpacity(into, 100)], kind).toEqual([1, 0]);
      expect([markOpacity(out, 100 + FADE_MS), markOpacity(into, 100 + FADE_MS)], kind).toEqual([0, 1]);
      // The speed wobbles it back and forth at the snapshot rate: still two marks, each fading from where it is.
      for (let k = 1; k <= 6; k++) m = stepModel(m, [k % 2 ? inside : onRim], 0, false, 100 + k * 100);
      expect(m.marks.filter((x) => x.item.kind === kind), kind).toHaveLength(2);
    }
  });

  it('the next lap post brightens by a cross-fade when the one before is passed', () => {
    const post = (x: number): RadarItem => ({ kind: 'post', x, y: 40, clamped: false, dist: 30 });
    let m = radarModel([post(40), post(90)], 0, false, 0);
    expect(m.marks.map((k) => k.next)).toEqual([true, false]);
    // P1 is passed: the list is now [P2, P3]. P2's dim mark fades out while its bright one fades in.
    m = stepModel(m, [post(90), post(120)], 0, false, 100);
    const p2 = m.marks.filter((k) => k.item.x === 90);
    expect(p2.map((k) => [k.next, markOpacity(k, 100)]).sort()).toEqual([[false, 1], [true, 0]]);
    expect(p2.map((k) => [k.next, markOpacity(k, 100 + FADE_MS)]).sort()).toEqual([[false, 0], [true, 1]]);
  });

  // ── Ruling 6: the drawing order and the grain decision are pure ────────────────────────────────────────────────────

  it('draws by layer whatever the order of the marks: a shelter fading out is drawn before live records', () => {
    const shelter: RadarItem = { kind: 'shelter', x: 30, y: 100, clamped: false, dist: 40 };
    const tower: RadarItem = { kind: 'tower', x: 40, y: 40, clamped: false, dist: 45 };
    const route: RadarItem = { kind: 'route', x: 74, y: 20, clamped: false, dist: 50, points: [{ x: 74, y: 74 }, { x: 74, y: 20 }] };
    const block: RadarItem = { kind: 'ranks', x: 100, y: 74, clamped: false, dist: 20, points: [{ x: 100, y: 60 }, { x: 120, y: 60 }, { x: 120, y: 90 }] };
    let m = radarModel([shelter, tower, rec(60), rec(90), route, block], 0, false, 0);
    m = stepModel(m, [rec(60), rec(90), route, block], 0, false, 100);
    expect(m.marks.map((k) => k.item.kind)).toEqual(['record', 'record', 'route', 'ranks', 'shelter', 'tower']);
    expect(drawOrder(m).map((d) => d.mark.item.kind)).toEqual(['ranks', 'shelter', 'route', 'tower', 'record', 'record']);
    // The component draws mapView's runs in turn: the ranks, the shelters, the route, then the points by layer (the tower
    // on its way out under the live records).
    const v = mapView(m, RADAR_PX);
    const kinds = (ds: Drawn[]) => ds.map((d) => d.mark.item.kind);
    expect([kinds(v.ranks), kinds(v.shelters), kinds(v.route), kinds(v.points)]).toEqual([['ranks'], ['shelter'], ['route'], ['tower', 'record', 'record']]);
    // drawOrder leaves out a mark that has faded out, even before a frame removes it from the model.
    const faded = { ...m, now: 100 + FADE_MS };
    expect(faded.marks.some((k) => k.item.kind === 'shelter')).toBe(true);
    expect(drawOrder(faded).map((d) => d.mark.item.kind)).toEqual(['ranks', 'route', 'record', 'record']);
    expect(kinds(mapView(faded, RADAR_PX).shelters)).toEqual([]);
  });

  // ── Round 2, ruling 5: each item keeps its own mark ────────────────────────────────────────────────────────────────

  /**
   * Steps the model through `snaps` (each taken at its time) on a 16 ms frame clock until `until`, and lists every frame
   * where a mark took another item's place, or came in or left at more than one frame's fade. A mark keeps to its own
   * item: one with radar.ts's key (the real snapshots carry one) keeps that key; one without (made up here) moves 2 px at
   * most in a frame, if it is a point (the ranks and the route draw by their outline and line).
   */
  function jumps(snaps: readonly { at: number; items: readonly RadarItem[] }[], until: number): string[] {
    let m = radarModel(snaps[0].items, 0, false, snaps[0].at);
    let prev = new Map(drawOrder(m).map((d) => [d.mark.key, d]));
    const step = 16 / FADE_MS + 1e-9;
    const out: string[] = [];
    let k = 1;
    for (let t = snaps[0].at + 16; t <= until; t += 16) {
      while (k < snaps.length && snaps[k].at <= t) m = stepModel(m, snaps[k++].items, 0, false, t);
      m = tickModel(m, t);
      const now = new Map(drawOrder(m).map((d) => [d.mark.key, d]));
      for (const [key, d] of now) {
        const p = prev.get(key);
        const what = `t ${t}: ${d.mark.item.kind} ${key}`;
        if (!p) {
          if (d.opacity > step) out.push(`${what} came in at ${d.opacity.toFixed(2)}`);
        } else {
          const moved = Math.hypot(d.mark.item.x - p.mark.item.x, d.mark.item.y - p.mark.item.y);
          const keyed = d.mark.item.key !== undefined || p.mark.item.key !== undefined;
          if (keyed ? d.mark.item.key !== p.mark.item.key : !isEdge(d.mark.item) && moved > 2) {
            out.push(`${what} moved ${moved.toFixed(1)} px at ${d.opacity.toFixed(2)}${keyed ? `, from ${p.mark.item.key} to ${d.mark.item.key}` : ''}`);
          }
        }
      }
      for (const [key, p] of prev) if (!now.has(key) && p.opacity > step) out.push(`t ${t}: ${p.mark.item.kind} ${key} left at ${p.opacity.toFixed(2)}`);
      prev = now;
    }
    return out;
  }

  it('an item whose look changes keeps its own mark, never a neighbour\'s: a record, shelter or gate reaching the rim beside another', () => {
    const at = (r: number, deg: number) => ({ x: C + r * Math.sin((deg * Math.PI) / 180), y: C - r * Math.cos((deg * Math.PI) / 180) });
    for (const kind of ['record', 'shelter', 'gate'] as const) {
      const inside: RadarItem = { kind, ...at(65.5, 0), clamped: false, dist: 69 };
      const onRim: RadarItem = { kind, ...at(R, 0), clamped: true, dist: 70.5 };
      // A neighbour on the rim 11.5 px away, listed after it; the first flips onto the rim, back, and on again.
      const neighbour: RadarItem = { kind, ...at(R, 10), clamped: true, dist: 90 };
      const snaps = [[inside, neighbour], [onRim, neighbour], [inside, neighbour], [onRim, neighbour]].map((items, k) => ({ at: k * 300, items }));
      expect(jumps(snaps, 1800), kind).toEqual([]);
      // The neighbour keeps its first key and stays at full the whole time.
      let m = radarModel(snaps[0].items, 0, false, 0);
      const key = m.marks[1].key;
      for (const s of snaps.slice(1)) {
        m = stepModel(m, s.items, 0, false, s.at);
        const own = m.marks.filter((x) => x.key === key);
        expect(own, `${kind} at ${s.at}`).toHaveLength(1);
        expect([own[0].item, markOpacity(own[0], s.at), own[0].to], `${kind} at ${s.at}`).toEqual([neighbour, 1, 1]);
      }
      // Listed the other way round, the same.
      expect(jumps(snaps.map((s) => ({ at: s.at, items: [...s.items].reverse() })), 1800), `${kind} reversed`).toEqual([]);
      // The first lands on the rim 1.2 px from where the neighbour's mark was, as the neighbour moves 2 px on along it:
      // the first's own mark (0.5 px off) is still nearer than the neighbour's, so each keeps its own.
      const before: RadarItem = { kind, ...at(R, 1), clamped: true, dist: 90 };
      const after: RadarItem = { kind, ...at(R, 2.7), clamped: true, dist: 90 };
      let n = radarModel([inside, before], 0, false, 0);
      const [first, second] = n.marks.map((x) => x.key);
      n = stepModel(n, [onRim, after], 0, false, 100);
      expect(n.marks.find((x) => x.key === second)!.item, kind).toEqual(after);
      expect(markOpacity(n.marks.find((x) => x.key === second)!, 100), kind).toBe(1);
      expect([n.marks.find((x) => x.key === first)!.item, n.marks.find((x) => x.key === first)!.to], kind).toEqual([inside, 0]);
      expect(jumps([{ at: 0, items: [inside, before] }, { at: 100, items: [onRim, after] }], 900), `${kind} moving`).toEqual([]);
    }
  });

  it('a fading copy of the new look comes back only at the item\'s own place, within 2 px', () => {
    const inside = rec(C, C - 65);
    const onRim = rec(C, C - R, true);
    // The record flips onto the rim and back within a fade: its own rim copy, still fading, comes back from where it is.
    let m = radarModel([inside], 0, false, 0);
    m = stepModel(m, [onRim], 0, false, 100);
    const rimKey = m.marks.find((x) => x.item.clamped)!.key;
    m = stepModel(m, [inside], 0, false, 300);
    m = stepModel(m, [{ ...onRim, x: onRim.x + 1.5 }], 0, false, 400);
    const back = m.marks.find((x) => x.key === rimKey)!;
    expect(back.to).toBe(1);
    expect(markOpacity(back, 400)).toBeCloseTo(0.2, 9);
    // A rim copy 5 px off is another place: the record gets a new key that fades in from 0, and the copy fades on out.
    let n = radarModel([inside], 0, false, 0);
    n = stepModel(n, [onRim], 0, false, 100);
    const copy = n.marks.find((x) => x.item.clamped)!.key;
    n = stepModel(n, [inside], 0, false, 300);
    n = stepModel(n, [{ ...onRim, x: onRim.x + 5 }], 0, false, 400);
    expect(n.marks.find((x) => x.key === copy)!.to).toBe(0);
    const fresh = n.marks.find((x) => x.item.clamped && x.to === 1)!;
    expect(fresh.key).not.toBe(copy);
    expect(markOpacity(fresh, 400)).toBe(0);
  });

  it('on the reviewer\'s 11 real prologue paths, at rest between snapshots 100 ms apart, no mark jumps or vanishes in a frame', () => {
    const path = (ps: { x: number; z: number }[]) => ps.map((p, k) => ({ at: k * 100, items: realSnap(0, { ...p, yaw: 0 }).radar }));
    const paths = {
      south: path(Array.from({ length: 40 }, (_, k) => ({ x: 0, z: -6 - k * 0.5 }))),
      north: path(Array.from({ length: 40 }, (_, k) => ({ x: 0, z: -25.5 + k * 0.5 }))),
      ...Object.fromEntries([-30, 0, 30, 60, 90].map((z) => [`z ${z}`, path(Array.from({ length: 240 }, (_, k) => ({ x: -150 + k * 1.25, z })))])),
      ...Object.fromEntries([-120, -60, 0, 40].map((x) => [`x ${x}`, path(Array.from({ length: 240 }, (_, k) => ({ x, z: -100 + k })))])),
    };
    let flips = 0;
    for (const [name, snaps] of Object.entries(paths)) {
      expect(jumps(snaps, snaps[snaps.length - 1].at + FADE_MS).slice(0, 5), name).toEqual([]);
      for (let k = 1; k < snaps.length; k++) {
        const was = snaps[k - 1].items.filter((i) => i.kind === 'record');
        flips += snaps[k].items.filter((i) => i.kind === 'record' && was.some((w) => w.key === i.key && w.clamped !== i.clamped)).length;
      }
    }
    // The paths do cross the rim: records flip their clamp on them, as in the review (108 flips).
    expect(flips).toBeGreaterThan(50);
  });

  it('the grains move only while the static shows and motion is welcome', () => {
    expect([grainsRun(true, false), grainsRun(true, true), grainsRun(false, false), grainsRun(false, true)]).toEqual([true, false, false, false]);
  });
});

describe('TouchControls', () => {
  const surge = { ready: true, frac: 0.5 };
  const sight = { on: false, charge: 0.25 };
  const render = (locale: Locale, manual: boolean, sg = surge) => renderToString(<TouchControls locale={locale} manual={manual} onChange={noop} surge={sg} sight={sight} />);
  const button = (html: string, cls: string) => html.match(new RegExp(`<button[^>]*${cls}[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';

  for (const l of LOCALES) {
    it(`${l}: labels come from touch.*, with the Rem, Laju and Mata classes and the steer zone`, () => {
      const t = GAME_COPY[l].touch;
      const html = render(l, false);
      for (const k of ['brake', 'surge', 'sight'] as const) expect(html).toContain(`aria-label="${esc(t[k])}"`);
      expect(html).toContain(`aria-label="${esc(t.steer)}"`);
      for (const c of ['bg-touch__btn--rem', 'bg-touch__btn--surge', 'bg-touch__btn--mata']) expect(html).toContain(c);
      expect(html).toContain('data-steer');
      expect(html).not.toContain('bg-touch__btn--ride');
      expect(render(l, true)).toContain('bg-touch__btn--ride');
    });
  }

  it('the Laju button holds one surge ring and the Mata button one sight ring; surge 0.5 sweeps 180 degrees', () => {
    const html = render('id', false);
    const laju = button(html, 'bg-touch__btn--surge');
    const mata = button(html, 'bg-touch__btn--mata');
    expect(count(laju, 'data-ring="surge"')).toBe(1);
    expect(count(laju, 'data-ring="sight"')).toBe(0);
    expect(laju).toContain('data-sweep="180"');
    expect(count(mata, 'data-ring="sight"')).toBe(1);
    expect(mata).toContain('data-sweep="90"');
    expect(button(html, 'bg-touch__btn--rem')).not.toContain('data-ring');
  });
});

// ── The chapter reports ────────────────────────────────────────────────────────────────────────────────────────────────

const sanjayaHtml = (l: Locale, i: number) =>
  renderToString(<SanjayaReport locale={l} chapterIndex={i} chapter={game.chapters[i]} onNext={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
const recordedHtml = (l: Locale, i: number) =>
  renderToString(<Recorded locale={l} chapterIndex={i} cards={game.events[i]} prologue={game.prologue} whole onNext={noop} report={game.report} />);
const finaleHtml = (l: Locale) =>
  renderToString(<Finale locale={l} totals={game.totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
/** The HTML with every element whose start tag holds one of `attrs` cut out, nesting included. */
function stripBlocks(html: string, attrs: string[]): string {
  let out = html;
  for (;;) {
    const at = attrs.map((a) => out.search(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*\\s${a}[=\\s>]`, 'i'))).filter((i) => i > -1).sort((a, b) => a - b)[0];
    if (at === undefined) return out;
    const tagEnd = out.indexOf('>', at);
    const block = element(out, out.slice(at, tagEnd));
    out = out.slice(0, at) + out.slice(at + block.length);
  }
}
const LAST = game.chapters.length - 1;
const PARVA_COUNT = PARVAS.length;

describe('SanjayaReport: the framed report block', () => {
  for (const l of LOCALES) {
    it(`${l}: one report block per chapter, framed, holding every <title> on the screen`, () => {
      for (let i = 0; i <= LAST; i++) {
        const html = sanjayaHtml(l, i);
        const marker = `data-entry="report-${game.chapters[i].id}"`;
        expect(count(html, marker), `chapter ${i}`).toBe(1);
        const block = element(html, marker);
        expect(block).toMatch(/^<section class="bg-entry bg-report"/);
        expect(block).toContain(esc(GAME_COPY[l].allegation));
        expect(block).toContain(reply(l));
        expect(block).toContain(esc(GAME_COPY[l].report.block));
        expect(block).toContain('class="bg-map"');
        const start = html.indexOf(block);
        for (const m of html.matchAll(/<title>/g)) {
          expect(m.index!, `chapter ${i}: a <title> outside the block`).toBeGreaterThan(start);
          expect(m.index!).toBeLessThan(start + block.length);
        }
      }
    });
  }

  it('parva 1: 17 names, 5 new and 12 seen before, in both locales', () => {
    const tile = (l: Locale) => {
      const t = GAME_COPY[l].report.tiles;
      return `<dt>${esc(t.names)}</dt><dd><b>17</b><span> 5 ${t.fresh} · 12 ${esc(t.again)}</span></dd>`;
    };
    expect(sanjayaHtml('id', 1)).toContain(tile('id'));
    expect(sanjayaHtml('id', 1)).toContain('5 baru · 12 muncul lagi');
    expect(sanjayaHtml('en', 1)).toContain(tile('en'));
    expect(sanjayaHtml('en', 1)).toContain('5 new · 12 seen before');
  });

  it('chapters with names get the three charts after the map; chapters 6 to 8 keep the sanjayaNone line and the map, with no chart', () => {
    for (const l of LOCALES) {
      const one = sanjayaHtml(l, 1);
      expect(count(one, 'bg-chart bg-chart--columns')).toBe(1);
      expect(count(one, 'bg-chart bg-chart--bars')).toBe(2);
      expectOrder(one, ['bg-tiles', 'class="bg-map"', 'id="bg-when-dadu-di-hastinapura-t"', 'id="bg-pasal-dadu-di-hastinapura-t"', 'id="bg-stages-dadu-di-hastinapura-t"']);
      for (const i of [6, 7, 8]) {
        expect(game.report.chapters[i].names).toBe(0);
        const html = sanjayaHtml(l, i);
        expect(html).not.toContain('bg-chart--columns');
        expect(html).not.toContain('bg-chart--bars');
        expect(html).toContain(esc(GAME_COPY[l].sanjayaNone));
        expect(html).toContain('class="bg-map"');
        expect(html).not.toContain('NaN');
      }
    }
  });

  it('entries carry their anchors: full entries and name-only ones', () => {
    const i = game.chapters.findIndex((c) => c.entries.some((e) => !e.full) && c.entries.some((e) => e.full));
    const html = sanjayaHtml('id', i);
    for (const e of game.chapters[i].entries) {
      expect(html).toContain(e.full ? `<article class="bg-entry" data-entry="${e.id}" id="bg-entry-${e.id}">` : `<li data-entry="${e.id}" id="bg-entry-${e.id}">`);
    }
  });

  it('the map shows the hub and group names from the copy: Indonesian as the graph has them, English on the EN page', () => {
    const labels = Object.fromEntries(game.report.map.nodes.map((n) => [n.id, n.label]));
    for (const [id, name] of Object.entries(GAME_COPY.id.report.map.names!)) expect(labels[id], id).toBe(name);
    const en = element(sanjayaHtml('en', LAST), 'data-entry="report-finale"');
    for (const name of ['Police reports', 'by the Pelapor', 'against the Pelapor']) expect(en).toContain(`<title>${name}</title>`);
    for (const name of ['Laporan polisi', 'oleh Pelapor', 'terhadap Pelapor']) expect(en).not.toContain(`<title>${name}</title>`);
  });
});

describe('Recorded: the framed strip and the card summaries', () => {
  for (const l of LOCALES) {
    it(`${l}: a report-strip block with the stat line, the allegation line and the time strip, before the records`, () => {
      for (let i = 0; i <= PARVA_COUNT; i++) {
        const html = recordedHtml(l, i);
        expect(count(html, 'data-entry="report-strip"'), `chapter ${i}`).toBe(1);
        const block = element(html, 'data-entry="report-strip"');
        expect(block).toMatch(/^<section class="bg-entry bg-report bg-report--strip" data-entry="report-strip">/);
        expect(block).toContain(esc(GAME_COPY[l].allegation));
        expect(block).toContain(reply(l));
        expect(count(block, 'bg-chart bg-chart--strip')).toBe(1);
        expectOrder(block, ['bg-report__stat', 'bg-allegation', 'bg-chart--strip']);
        expect(html.indexOf(block)).toBeLessThan(html.indexOf(i === 0 ? 'data-entry="prologue-dates"' : 'data-catch'));
        expect(count(block, '<rect class="bg-mark"')).toBe(PARVA_COUNT);
        expect(block).not.toContain('NaN');
      }
    });
  }

  it('the stat line: events, the window and the channels for a parva; the dates for the prologue', () => {
    const cards = game.events[1];
    const channels = [...new Set(cards.map((e) => e.channel.en))].join(', ');
    expect(recordedHtml('en', 1)).toContain(esc(GAME_COPY.en.report.strip.stat({ n: cards.length, from: 'April 26, 2026', to: 'May 2, 2026', channels })));
    expect(recordedHtml('id', 1)).toContain(`${cards.length} peristiwa · 26 April 2026 sampai 2 Mei 2026 · `);
    // The prologue: the earliest and latest ISO dates, formatted in the locale, never the dossier labels.
    const isos = game.prologue.map((d) => d.iso).sort();
    expect(isos[0]).toBe('2023');
    expect(isos.at(-1)).toBe('2023-09-24');
    const stats = { id: '8 tanggal · 2023 sampai 24 September 2023', en: '8 dates · 2023 to September 24, 2023' };
    for (const l of LOCALES) {
      const line = element(recordedHtml(l, 0), 'class="bg-report__stat"');
      expect(line).toBe(`<p class="bg-report__stat">${stats[l]}</p>`);
      expect(line.split(l === 'id' ? ' sampai ' : ' to ').length - 1, l).toBe(1);
    }
  });

  it('parva 3: one current mark, the third window, labelled 3', () => {
    const block = element(recordedHtml('id', 3), 'data-entry="report-strip"');
    const current = [...block.matchAll(/<rect class="bg-mark"[^>]*data-current=""[^>]*>/g)];
    expect(current).toHaveLength(1);
    expect(block).toMatch(/<text class="bg-mark__label"[^>]*data-current="">3<\/text>/);
    expect(count(block, 'data-current=""')).toBe(3);
    expect(element(recordedHtml('id', 0), 'data-entry="report-strip"')).not.toContain('data-current');
  });

  it('every card holds its summary after its title', () => {
    for (const l of LOCALES) {
      for (let i = 1; i <= PARVA_COUNT; i++) {
        const cards = blocks(recordedHtml(l, i), 'article', 'data-catch');
        expect(cards).toHaveLength(game.events[i].length);
        game.events[i].forEach((e, k) => {
          expect(e.summary[l].length).toBeGreaterThan(0);
          expect(cards[k]).toContain(`<p class="bg-catch__summary">${esc(e.summary[l])}</p>`);
          expectOrder(cards[k], [esc(e.title[l]), 'bg-catch__summary', 'bg-allegation']);
        });
      }
    }
  });
});

describe('Finale: the framed report block', () => {
  for (const l of LOCALES) {
    it(`${l}: the map with its rail, one Columns, three BarLists and one TimeStrip, framed, with the closing block still last`, () => {
      const html = finaleHtml(l);
      expect(count(html, 'data-entry="report-finale"')).toBe(1);
      const block = element(html, 'data-entry="report-finale"');
      expect(block).toContain(esc(GAME_COPY[l].allegation));
      expect(block).toContain(reply(l));
      expect(count(block, 'class="bg-map__chip"')).toBe(11);
      expect(count(block, 'bg-chart bg-chart--columns')).toBe(1);
      expect(count(block, 'bg-chart bg-chart--bars')).toBe(3);
      expect(count(block, 'bg-chart bg-chart--strip')).toBe(1);
      expectOrder(html, [esc(GAME_COPY[l].finaleTotals(game.totals).at(-1)!), 'data-entry="report-finale"', 'data-entry="finale-close"']);
      const framed = [...html.matchAll(/data-entry="([^"]+)"/g)].map((m) => m[1]);
      expect(framed.at(-1)).toBe('finale-close');
      const r = GAME_COPY[l].report;
      expectOrder(block, [esc(r.block), esc(r.lead), 'bg-allegation', 'class="bg-map"', esc(r.finale.months), esc(r.finale.perChapter), esc(r.finale.pasalTop), esc(r.stages.title), esc(r.finale.reports)]);
      // The months: the 8 windows as marks, none current; the parts: one row per chapter by its short name.
      expect(count(block, '<rect class="bg-mark"')).toBeGreaterThanOrEqual(PARVA_COUNT);
      expect(element(block, 'bg-chart--columns')).not.toContain('data-current');
      const parts = element(block, 'aria-labelledby="bg-fin-parts-t"');
      for (const name of [r.chapterName.prologue, r.chapterName.parva({ n: 1 }), r.chapterName.finale]) expect(parts).toContain(`<span class="bg-bars__label">${esc(name)}</span>`);
      expect(count(parts, '<span class="bg-bars__label">')).toBe(game.chapters.length);
      expect(block).not.toContain('NaN');
    });
  }
});

describe('the frame sweep: no terlapor name outside a framed block', () => {
  it('Sanjaya, Tercatat and the finale, every chapter, both locales', () => {
    let screens = 0;
    for (const l of LOCALES) {
      const all: [string, string][] = [];
      for (let i = 0; i <= LAST; i++) all.push([`sanjaya ${i}`, stripBlocks(sanjayaHtml(l, i), ['data-entry'])]);
      // Tercatat's event cards are framed too: each holds the allegation line and the reply link (data-catch).
      for (let i = 0; i <= PARVA_COUNT; i++) all.push([`recorded ${i}`, stripBlocks(recordedHtml(l, i), ['data-entry', 'data-catch'])]);
      all.push(['finale', stripBlocks(finaleHtml(l), ['data-entry'])]);
      for (const [where, rest] of all) {
        expect(rest).not.toContain('data-entry');
        expect(rest).not.toContain('<title>');
        for (const n of NAMES) expect(rest, `${l} ${where}: ${n}`).not.toContain(esc(n));
        screens++;
      }
    }
    expect(screens).toBe(2 * (game.chapters.length + PARVA_COUNT + 1 + 1));
  });
});

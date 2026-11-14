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
import type { HudSnapshot, ObjectiveKey } from '../src/lib/bowobharata-game/hud';
import type { GameEvent, HintKey } from '../src/lib/bowobharata-game/mission-run';
import { CHAPTER_TYPES, type MissionType } from '../src/lib/bowobharata-game/missions';
import {
  FailCard, Finale, GameHud, Gate, Intro, MissionCard, Paused, Recorded, SanjayaReport, SlowPrompt, TouchControls, cardView, toastText, type HudToast,
} from '../src/components/bowobharata-game/screens';

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

  it('the events that are not toasts give null', () => {
    const quiet: GameEvent[] = [
      { type: 'introStart' }, { type: 'introEnd' }, { type: 'bump', speed: 4 }, { type: 'absorbed' }, { type: 'stepDone', step: 0 },
      { type: 'level', level: 2 }, { type: 'hint', key: 'ride' }, { type: 'volley', id: 1 }, { type: 'outroStart' },
      { type: 'failed', reason: 'time' }, { type: 'done', score: 300, whole: true },
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

describe('GameHud', () => {
  /** A HUD snapshot of the prologue, 2 of 8 recorded, with any field replaced. */
  const snap = (o: Partial<HudSnapshot> = {}): HudSnapshot => ({
    phase: 'active', chapter: 0, type: 'himpun', objective: 'prologue', done: 2, total: 8, lap: null, timer: null, speedKmh: 31,
    surge: { ready: true, frac: 1 }, sight: { on: false, charge: 0.5 }, hint: null, ...o,
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

  it('the toasts sit in a polite status region, in order', () => {
    const empty = gameHud();
    expect(empty).toContain('<div class="bg-toasts" role="status" aria-live="polite"></div>');
    const toasts = [{ id: 7, text: GAME_COPY.id.toasts.checkpoint }, { id: 8, text: GAME_COPY.id.toasts.recordedPrologue({ n: 3, total: 8 }) }];
    const region = element(gameHud({ toasts }), 'class="bg-toasts"');
    expect(region).toMatch(/^<div class="bg-toasts" role="status" aria-live="polite">/);
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
      const touch = gameHud({ locale: l, touch: true });
      expect(element(touch, 'class="bg-gauges"')).toContain('data-gauge="speed"');
      expect(touch).not.toContain('data-ring');
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

  it('each objective has its line; the ones without copy yet show none, and the frame line stays', () => {
    for (const l of LOCALES) {
      const o = GAME_COPY[l].objectives;
      const line: Partial<Record<ObjectiveKey, string>> = {
        roam: o.roam, prologue: o.prologue({ done: 2, total: 8 }), collect: o.collect({ done: 2, total: 8 }), tower: o.tower, stop: o.stop,
      };
      for (const key of OBJECTIVES) {
        const html = gameHud({ locale: l, hud: { objective: key } });
        expect(html, key).toContain(esc(GAME_COPY[l].hudFrame));
        const want = line[key];
        if (want) expect(element(html, 'class="bg-objective"'), key).toContain(esc(want));
        else expect(html, key).not.toContain('bg-objective__line');
      }
    }
  });

  it('for every chapter and type, in both locales, it holds no terlapor name and no event title', () => {
    /** Every parva event title, from parvaEvents, in Indonesian and English. */
    const titles = PARVAS.flatMap((p) => parvaEvents(p)).flatMap((e) => [e.title, localizeEvent(e, 'en').title]);
    expect(titles).toHaveLength(2 * game.events.flat().length);
    const types: MissionType[] = ['himpun', 'antar', 'lintasan', 'uji'];
    const quiet: GameEvent[] = [{ type: 'filed' }, { type: 'rewriteTaken' }, { type: 'held' }, { type: 'checkpoint' }, { type: 'wall' }];
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

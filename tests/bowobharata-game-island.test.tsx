import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { parseSync } from 'vite';
import { FRAMING, PARVAS } from '../src/lib/bowobharata';
import { FRAMING_EN } from '../src/lib/bowobharata-en';
import { kategoriKey, type Perkara } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { hudOf, type HudSnapshot } from '../src/lib/bowobharata-game/hud';
import { NO_INPUT, initChariot, speedOf } from '../src/lib/bowobharata-game/drive';
import { DEFAULT_ASPECT, advance, createWorld, startChapter, type GameState } from '../src/lib/bowobharata-game/engine';
import { createBot } from '../src/lib/bowobharata-game/autopilot';
import { realTargets, CHAPTER_TYPES, missionFor, type StepDef } from '../src/lib/bowobharata-game/missions';
import { startRun, stepRun, type GameEvent, type Phase, type RunFrame, type RunState } from '../src/lib/bowobharata-game/mission-run';
import { RADAR_PX, type RadarItem } from '../src/lib/bowobharata-game/radar';
import {
  EMPTY_TOASTS, TOAST_GAP_MS, TOAST_QUEUE_MAX, queueToasts, toastPump, type Toast,
} from '../src/lib/bowobharata-game/toast-queue';
import {
  Gate, Intro, SanjayaReport, CatchCard, Finale, Paused, DataError, FallbackPlay, FailCard, MissionCard, Recorded, SlowPrompt, TouchControls,
  cardView, GameHud, Radar, chapterInfo, toastText, type GatePosters, type HudToast,
} from '../src/components/bowobharata-game/screens';
import type { EventCard } from '../src/lib/bowobharata-game/data';
import BowobharataGame from '../src/components/BowobharataGame';
import { E_FORMS, NAME_FORMS, cardOfIn, namesIn, readable } from './bowobharata-game-sweep';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
/** The data the island receives: Sanjaya's chapters as ChapterView, the event cards and the prologue dates. */
const game = gameData(data);
/** Each chapter's terlapor ids, as the island hands them to the report screens. */
const chapterIds = game.chapters.map((c) => c.entries.map((e) => e.id));
const chapters = game.chapters;
const totals = game.totals;
const COUNT = chapters.length;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const nonE = data.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
const noop = () => {};
const settings = { assist: false, easy: false };
// With the way out of a replay (Task 38), so its line is swept too.
const pausedEl = (locale: 'id' | 'en') => <Paused locale={locale} onResume={noop} settings={settings} onSettings={noop} onLeaveReplay={noop} onUseStill={noop} />;
const paused = (locale: 'id' | 'en') => renderToString(pausedEl(locale));

/** FRAMING's paragraphs as the gate and the pause panel render them. */
const framingParas = (locale: 'id' | 'en') => (locale === 'en' ? FRAMING_EN : FRAMING).map((p) => `<p>${esc(p)}</p>`);
/** How often FRAMING names Abil Sudarman, at Task 37: once, in the right of reply. */
const FRAMING_ABIL = 1;
/** The HTML with each piece cut out; each piece must occur in it exactly once. */
function cutOut(html: string, pieces: readonly string[], where: string): string {
  let rest = html;
  for (const p of pieces) {
    expect(rest.split(p).length - 1, `${where}: ${p.slice(0, 80)}`).toBe(1);
    rest = rest.replace(p, () => ' ');
  }
  return rest;
}
/** Text that names Abil Sudarman `abil` times, holds "Sengkuni" `sengkuni` times, and no other category E form. */
function expectOnlyAbil(text: string, abil: number, sengkuni: number, where: string) {
  expect(text.match(/abil sudarman/gi)?.length ?? 0, `${where}: Abil Sudarman`).toBe(abil);
  expect(text.match(/sengkuni/gi)?.length ?? 0, `${where}: Sengkuni`).toBe(sengkuni);
  expect(namesIn(text.replace(/abil sudarman/gi, ' '), E_FORMS), `${where}: any other category E form`).toEqual([]);
}
/** The capitalised JSX tags a TSX source renders: the components it shows. */
function jsxTags(name: string, src: string): Set<string> {
  const { program, errors } = parseSync(name, src, { lang: 'tsx' });
  if (errors.length > 0) throw new Error(`${name} does not parse: ${errors.map((e) => e.message).join('; ')}`);
  const tags = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const n = v as { type?: string; name?: { type?: string; name?: string } };
    if (n.type === 'JSXOpeningElement' && n.name?.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name.name ?? '')) tags.add(n.name.name!);
    for (const [k, x] of Object.entries(v)) if (k !== 'parent') visit(x);
  };
  visit(program);
  return tags;
}

/** Character ranges of every element carrying data-entry (article, li, or the report's section; never nested in its own kind). */
function entryRanges(html: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of html.matchAll(/<(article|li|section)[^>]*data-entry="[^"]*"[^>]*>[\s\S]*?<\/\1>/g)) out.push([m.index!, m.index! + m[0].length]);
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

const sanjayaEl = (i: number, locale: 'id' | 'en') =>
  <SanjayaReport locale={locale} chapterIndex={i} chapter={chapters[i]} onNext={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />;
const sanjaya = (i: number, locale: 'id' | 'en' = 'id') => renderToString(sanjayaEl(i, locale));
/** The version without animation of chapter `i`, with `taken` of its steps taken in. */
const fallbackPlay = (i: number, taken: number, locale: 'id' | 'en') =>
  <FallbackPlay locale={locale} chapterIndex={i} cards={game.events[i]} prologue={game.prologue} taken={taken} onTake={noop} onDone={noop} />;
/** The gate's posters as the page hands them to the island (GatePosters): its optimised files, at two widths. */
const PAGE_POSTERS: GatePosters = {
  krishna: { src: '/_astro/krishna.640w.webp', srcset: '/_astro/krishna.400w.webp 400w, /_astro/krishna.640w.webp 640w', sizes: '(max-width: 700px) 100vw, 540px' },
  sengkuni: { src: '/_astro/sengkuni.640w.webp', srcset: '/_astro/sengkuni.400w.webp 400w, /_astro/sengkuni.640w.webp 640w', sizes: '(max-width: 700px) 100vw, 540px' },
};

/** Every radar kind, some on the rim: kinds and positions only, as the snapshot carries them. */
const RADAR: RadarItem[] = [
  { kind: 'ranks', x: 131, y: 41, clamped: true, dist: 6, points: [{ x: 96, y: 4 }, { x: 196, y: 4 }, { x: 196, y: 70 }, { x: 96, y: 70 }] },
  { kind: 'shelter', x: 40, y: 100, clamped: false, dist: 44 },
  { kind: 'route', x: 74, y: 8, clamped: true, dist: 240, points: [{ x: 74, y: 74 }, { x: 70, y: 40 }, { x: 74, y: 8 }] },
  { kind: 'decoy', x: 60, y: 50, clamped: false, dist: 25 },
  { kind: 'tower', x: 140, y: 74, clamped: true, dist: 180 },
  { kind: 'replay', x: 30, y: 30, clamped: false, dist: 60 },
  { kind: 'marker', x: 90, y: 110, clamped: false, dist: 40 },
  { kind: 'record', x: 70, y: 60, clamped: false, dist: 15 },
  { kind: 'record', x: 74, y: 140, clamped: true, dist: 300 },
  { kind: 'gate', x: 100, y: 90, clamped: false, dist: 30 },
  { kind: 'post', x: 50, y: 74, clamped: false, dist: 25 },
  { kind: 'post', x: 110, y: 50, clamped: false, dist: 45 },
];
/**
 * The HUD in play, three snapshots: the prologue on a desk; parva 4's course under static on touch, with the toasts of its
 * first two records (their real dates and channels); and a replay of Antar's gate at the top of the clamour, in Mata's sight.
 */
function inPlay(locale: 'id' | 'en'): { label: string; el: ReactElement }[] {
  const prologue: HudSnapshot = {
    phase: 'active', chapter: 0, type: CHAPTER_TYPES[0], objective: 'prologue', done: 3, total: game.prologue.length, lap: null, timer: 95,
    speedKmh: 31, surge: { ready: true, frac: 1 }, sight: { on: false, charge: 0.6 }, hint: 'sight', riuh: 1.2, level: 1, staticFrac: 0,
    radar: RADAR, radarM: 84.3, heading: 20, replay: false,
  };
  const cards = game.events[4];
  const toasts: HudToast[] = [0, 1].flatMap((k) => {
    const text = toastText({ type: 'recorded', id: `r${k}`, card: k, n: k + 1, total: cards.length }, locale, 4, cardOfIn(game.events, 4, locale));
    return text === null ? [] : [{ id: k, text }];
  });
  expect(toasts).toHaveLength(2);
  const course = { ...prologue, chapter: 4, type: CHAPTER_TYPES[4], objective: 'course' as const, done: 2, total: cards.length, riuh: 4.6, level: 4, staticFrac: 0.3, heading: 200 };
  // A replay of Antar from a later chapter's roam (Task 36): its roam.replay line in the panel, where the hint was.
  const gate = {
    ...prologue, chapter: 2, type: CHAPTER_TYPES[2], objective: 'gate' as const, done: 1, total: 2, riuh: 5, level: 5, staticFrac: 0.45,
    sight: { on: true, charge: 0.4 }, heading: 300, replay: true,
  };
  const hud = (snap: HudSnapshot, touch: boolean, list: HudToast[]) =>
    <GameHud locale={locale} hud={snap} touch={touch} paused={false} toasts={list} onPause={noop} onFullscreen={noop} canFullscreen />;
  return [
    { label: 'prologue', el: hud(prologue, false, []) },
    { label: 'course', el: hud(course, true, toasts) },
    { label: 'replay', el: hud(gate, false, []) },
    { label: 'radar', el: <Radar locale={locale} items={RADAR} riuh={4.6} staticFrac={0.3} size={RADAR_PX} m={96} heading={135} sight={false} objective="tower" /> },
  ];
}

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

    it(`${locale}: "Sengkuni" appears only inside Abil Sudarman's labelled poster, with or without the page's posters`, () => {
      for (const posters of [undefined, PAGE_POSTERS]) {
        const html = renderToString(<Gate locale={locale} fallback={false} onStart={noop} posters={posters} />);
        const fig = html.match(/<figure[^>]*data-poster="sengkuni"[^>]*>[\s\S]*?<\/figure>/);
        expect(fig).not.toBeNull();
        expect(fig![0]).toContain('Abil Sudarman');
        if (posters) expect(fig![0]).toContain(`src="${posters.sengkuni.src}"`);
        const rest = html.replace(fig![0], '');
        expect(rest).not.toMatch(/Sengkuni/);
      }
    });
  }

  it('holds the gate to category E, in every form and case: only FRAMING and the labelled poster name Abil Sudarman, and only the poster says Sengkuni (both locales, with and without animation, with and without the page\'s posters)', () => {
    let renders = 0;
    for (const locale of ['id', 'en'] as const) {
      for (const fallback of [false, true]) {
        for (const posters of [undefined, PAGE_POSTERS]) {
          const where = `${locale}, fallback ${fallback}, ${posters ? "the page's posters" : 'no posters'}`;
          const html = renderToString(<Gate locale={locale} fallback={fallback} onStart={noop} posters={posters} />);
          const figures = html.match(/<figure[^>]*data-poster="sengkuni"[^>]*>[\s\S]*?<\/figure>/g) ?? [];
          expect(figures, `${where}: the labelled poster`).toHaveLength(1);
          const figure = figures[0] ?? '';
          const framing = framingParas(locale);
          const rest = cutOut(html, [...framing, figure], where);
          // Everything else on the gate: its text and labels, the Krishna poster, the notes, the controls and the button.
          expect(namesIn(readable(rest), E_FORMS), `${where}: outside FRAMING and the poster`).toEqual([]);
          expect(rest, `${where}: outside the poster`).not.toMatch(/sengkuni/i);
          // The page's casting: Abil Sudarman as Sengkuni, once each, and nobody else.
          expectOnlyAbil(readable(figure), 1, 1, `${where}: the labelled poster`);
          // FRAMING names Abil Sudarman, for the right of reply, and nobody else; it never says Sengkuni.
          expectOnlyAbil(readable(framing.join('\n')), FRAMING_ABIL, 0, `${where}: FRAMING`);
          renders++;
        }
      }
    }
    expect(renders).toBe(8);
  });

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

  it('no category E name, in any form or case, in the text or labels of any screen the island shows in play or between lakon; FRAMING and the event cards\' titles and summaries are cut out, FRAMING is pinned, and "Sengkuni" shows only on Intro 1', () => {
    // By ruling, only FRAMING (here on the pause panel; the gate has its own test) and the event cards' titles and
    // summaries (linimasa text, each under the allegation line) may name category E people. Those are cut out of each
    // render and FRAMING is pinned below. Everything else a person can read or hear (the text, alt, title and the ARIA
    // labels; not URLs) is held to every form of their names, in any case.
    /** Each render of the sweep: its component, its HTML, and what is left of it once its cut-outs are out. */
    const checked: { component: string; label: string; html: string; strict: string }[] = [];
    const put = (label: string, el: ReactElement, pieces: readonly string[] = []) => {
      const component = typeof el.type === 'function' ? el.type.name : String(el.type);
      const html = renderToString(el);
      checked.push({ component, label: `${component} ${label}`, html, strict: cutOut(html, pieces, `${component} ${label}`) });
      return html;
    };
    for (const locale of ['id', 'en'] as const) {
      /** The cards' titles and summaries, as CatchCard renders them: the only part of a card that may name category E. */
      const cardText = (cards: readonly EventCard[]) =>
        cards.map((e) => cardView(e, locale)).flatMap((v) => [`<h3>${esc(v.title)}</h3>`, `<p class="bg-catch__summary">${esc(v.summary)}</p>`]);
      for (let i = 0; i < COUNT; i++) {
        put(`${locale} ${i}`, sanjayaEl(i, locale));
        put(`${locale} ${i}`, <Intro locale={locale} chapterIndex={i} onNext={noop} />);
        if (i < CHAPTER_TYPES.length) {
          put(`${locale} ${i}`, <MissionCard locale={locale} chapterIndex={i} type={CHAPTER_TYPES[i]} />);
          // Each lakon's version without animation, before its first step.
          put(`${locale} ${i} first step`, fallbackPlay(i, 0, locale));
        }
        const cards = game.events[i];
        cards.forEach((card, k) => put(`${locale} ${i}.${k}`, <CatchCard locale={locale} card={cardView(card, locale)} />, cardText([card])));
        if (cards.length > 0) {
          put(`${locale} ${i}`, <Recorded locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} whole onNext={noop} report={game.report} />, cardText(cards));
          // ... and with every one of its event cards taken in.
          put(`${locale} ${i} all taken`, fallbackPlay(i, cards.length, locale), cardText(cards));
        }
      }
      put(`${locale} prologue`, <Recorded locale={locale} chapterIndex={0} cards={game.events[0]} prologue={game.prologue} whole={false} onNext={noop} report={game.report} />);
      // The prologue's one step taken in, without animation: its framed dates.
      put(`${locale} prologue dates`, fallbackPlay(0, 1, locale));
      for (const reason of ['time', 'muddied'] as const) {
        put(`${locale} ${reason}`, <FailCard locale={locale} reason={reason} fails={2} assist={false} onRetry={noop} onSkip={noop} />);
      }
      put(locale, <Finale locale={locale} totals={totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
      put(locale, <TouchControls locale={locale} manual onChange={noop} surge={{ ready: true, frac: 1 }} sight={{ on: false, charge: 0 }} />);
      for (const { label, el } of inPlay(locale)) {
        const html = put(`${locale} ${label}`, el);
        if (label === 'replay') expect(html, 'the replay snapshot').toContain(esc(GAME_COPY[locale].roam.replay));
      }
      put(locale, <DataError locale={locale} onRetry={noop} />);
      put(locale, <SlowPrompt locale={locale} onUseStill={noop} onKeepPlaying={noop} />);
      // The pause panel, less FRAMING, which it shows whole and which is pinned below.
      put(locale, pausedEl(locale), framingParas(locale));
    }
    // Per locale: Sanjaya ×10, Intro ×10, MissionCard ×9, FallbackPlay ×18 (each lakon before its first step, the
    // prologue's dates, and each parva with its cards taken in), CatchCard ×24, Recorded ×9 (each parva's Tercatat and the
    // prologue's), FailCard ×2, the finale, TouchControls, GameHud for 3 snapshots (their toasts with them), the Radar,
    // DataError, SlowPrompt and the pause panel.
    expect(CHAPTER_TYPES).toHaveLength(COUNT - 1);
    const tally: Record<string, number> = {};
    for (const c of checked) tally[c.component] = (tally[c.component] ?? 0) + 1;
    expect(tally).toEqual({
      SanjayaReport: 2 * COUNT, Intro: 2 * COUNT, MissionCard: 2 * (COUNT - 1), FallbackPlay: 2 * (COUNT - 1 + 1 + PARVAS.length),
      CatchCard: 2 * game.events.flat().length, Recorded: 2 * (PARVAS.length + 1), FailCard: 2 * 2, Finale: 2, TouchControls: 2, GameHud: 2 * 3,
      Radar: 2, DataError: 2, SlowPrompt: 2, Paused: 2,
    });
    expect(checked).toHaveLength(2 * (COUNT + COUNT + (COUNT - 1) + (COUNT - 1 + 1 + PARVAS.length) + game.events.flat().length + (PARVAS.length + 1) + 2 + 1 + 1 + 3 + 1 + 3));
    expect(checked.filter((c) => c.html.includes('class="bg-hud')).length).toBe(2 * 3);
    // The HUD's toasts (HudToast): the course snapshot's two records, with their dates and channels.
    expect(checked.map((c) => c.html).join('\n').split('class="bg-toast"').length - 1).toBe(2 * 2);
    expect(checked.filter((c) => c.html.includes('class="bg-radar"')).length).toBe(2 * 4);
    expect(checked.filter((c) => c.html.includes('class="bg-screen bg-fallback"')).length).toBe(2 * (COUNT - 1 + 1 + PARVAS.length));
    expect(checked.filter((c) => c.html.includes('class="bg-screen bg-error"')).length).toBe(2);
    expect(checked.filter((c) => c.html.includes('class="bg-screen bg-slow"')).length).toBe(2);
    expect(checked.filter((c) => c.html.includes('class="bg-screen bg-paused"')).length).toBe(2);
    // Category E: every form, any case, in the text and readable labels of every render, less its cut-outs.
    expect(E_FORMS).toContain('abil sudarman');
    for (const c of checked) expect(namesIn(readable(c.strict), E_FORMS), c.label).toEqual([]);
    // FRAMING, cut out of the pause panel: Abil Sudarman as at Task 37, nobody else, and no Sengkuni.
    for (const locale of ['id', 'en'] as const) expectOnlyAbil(readable(framingParas(locale).join('\n')), FRAMING_ABIL, 0, `FRAMING ${locale}`);
    // "Sengkuni", in any case and anywhere in the HTML: only the epic's own episode line of parva 1, on its intro card, once
    // in each locale; no other render. That card names nobody.
    const sengkuni = Object.fromEntries(checked.map((c) => [c.label, c.html.match(/sengkuni/gi)?.length ?? 0] as const).filter(([, n]) => n > 0));
    expect(sengkuni).toEqual({ 'Intro id 1': 1, 'Intro en 1': 1 });
    for (const c of checked.filter((x) => x.label in sengkuni)) expect(namesIn(readable(c.html), NAME_FORMS), c.label).toEqual([]);
    // Every screen the island renders is in this sweep, or exempt with its reason.
    const EXEMPT: Record<string, string> = { Gate: "its own test above: FRAMING and Abil Sudarman's labelled poster cut out and pinned" };
    const island = jsxTags('BowobharataGame.tsx', readFileSync('src/components/BowobharataGame.tsx', 'utf8'));
    expect(island.size).toBeGreaterThanOrEqual(13);
    const swept = new Set(checked.map((c) => c.component));
    for (const tag of island) expect(swept.has(tag) || tag in EXEMPT, `${tag}: the island renders it, yet it is neither swept nor exempt`).toBe(true);
    for (const tag of Object.keys(EXEMPT)) expect(island.has(tag), `${tag}: exempt, yet the island does not render it`).toBe(true);
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
        const recorded = renderToString(<Recorded locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} whole onNext={noop} report={game.report} />);
        const fb = renderToString(<FallbackPlay locale={locale} chapterIndex={i} cards={cards} prologue={game.prologue} taken={cards.length} onTake={noop} onDone={noop} />);
        for (const html of [recorded, fb]) {
          // Tercatat adds its framed report strip, with one more allegation line.
          expect(html.split(allegation).length - 1).toBe(cards.length + (html === recorded ? 1 : 0));
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
    const html = renderToString(<Finale locale="id" totals={totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
    expect(html).toContain(`${totals.reportsBy} laporan dibuat Rahmat Wibowo, ${totals.reportsAgainst} laporan terhadapnya`);
    expect(html).toContain(`href="/pantau"`);
    expect(html).toContain(esc(GAME_COPY.id.finaleClose));
    expect(renderToString(<Finale locale="en" totals={totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />)).toContain('href="/en/monitor"');
  });

  it('the finale closing line sits in an entry with the allegation line and the reply link', () => {
    for (const locale of ['id', 'en'] as const) {
      const html = renderToString(<Finale locale={locale} totals={totals} onAgain={noop} report={game.report} chapterIds={chapterIds} allow3d={false} />);
      const close = html.match(/<article[^>]*data-entry="finale-close"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? '';
      expect(close).toContain(esc(GAME_COPY[locale].finaleClose));
      expectFramedNames(html, locale);
      // The report block and the closing block.
      expect(entryRanges(html)).toHaveLength(2);
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

describe('toast pacing: the island\'s own pump, every toast the newest for 1.5 s at least, none pushed while paused', () => {
  const SLUGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const def = (ch: number) => missionFor(ch, SLUGS.slice(0, [0, 2, 2, 4, 9, 1, 2, 2, 2][ch]));
  const DT = 1 / 60;
  const frame = (at: { x: number; z: number }, speed = 0, prev = at): RunFrame => ({
    car: { ...initChariot(at.x, at.z, 0), vx: speed, vz: 0 }, mid: at, midPrev: prev, dt: DT, sight: false, skip: false, riuh: 0, decoys: [],
  });
  const active = (ch: number, over: Partial<RunState> = {}): RunState => ({ ...startRun(def(ch)), phase: 'active', ...over });
  /** A frame's toasts as the island makes them: each event's line through toastText, with the frame's events. */
  const toastsOf = (events: readonly GameEvent[], chapter: number): Toast[] =>
    events.flatMap((e) => {
      const text = toastText(e, 'en', chapter, () => ({ date: 'May 4, 2026', channel: 'LinkedIn' }), events);
      return text === null ? [] : [{ type: e.type, text }];
    });
  /** The prologue's last record: its frame gives the record and its step's checkpoint together. */
  const prologuePair = () => {
    const all = realTargets(def(0)).map((t) => t.id);
    const r = stepRun(active(0, { recorded: all.slice(0, 7) }), frame({ x: -54, z: 24 }));
    expect(r.events.map((e) => e.type)).toEqual(['recorded', 'stepDone', 'checkpoint']);
    return toastsOf(r.events, 0);
  };

  // The pump the island runs (toastPump), on fake timers: the island gives it performance.now, its own timers and
  // pushToast; here Date.now, setTimeout and a log of the pushes, each with its time.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());
  /** A fresh pump on a fresh clock at 0, as at the start of a play. */
  function island() {
    vi.clearAllTimers();
    vi.setSystemTime(0);
    const pushes: { at: number; text: string }[] = [];
    const pump = toastPump({ now: () => Date.now(), schedule: (fn, ms) => void setTimeout(fn, ms), push: (t) => void pushes.push({ at: Date.now(), text: t.text }) });
    return { pump, pushes, at: (t: number) => vi.advanceTimersByTime(t - Date.now()) };
  }
  /** How long each push stayed the newest: until the next push, or its own 4 s (TOAST_MS) at most. */
  const newest = (pushes: { at: number }[]) => pushes.map((p, i) => Math.min((pushes[i + 1]?.at ?? Infinity) - p.at, 4000));

  it('the prologue\'s last record and its step\'s checkpoint, in one frame: the record at once, the checkpoint 1.5 s later', () => {
    const toasts = prologuePair();
    expect(toasts.map((t) => t.type)).toEqual(['recorded', 'checkpoint']);
    const { pump, pushes, at } = island();
    pump.add(toasts);
    at(6000);
    expect(pushes).toEqual([{ at: 0, text: toasts[0].text }, { at: TOAST_GAP_MS, text: toasts[1].text }]);
    for (const n of newest(pushes)) expect(n).toBeGreaterThanOrEqual(TOAST_GAP_MS);
  });

  it('Antar\'s letter and its checkpoint, in one frame: both shown, 1.5 s apart', () => {
    const gate = def(2).steps[1] as Extract<StepDef, { kind: 'reach' }>;
    let run = active(2, { step: 1, recorded: ['A'], legT: 40, t: 40 });
    const { pump, pushes, at } = island();
    let frames = 0;
    for (let k = 0; k < Math.round(1.6 / DT) && run.step === 1; k++) {
      const r = stepRun(run, frame(gate.at, 1));
      run = r.run;
      at(Math.round(k * DT * 1000));
      if (r.events.length > 0) {
        const toasts = toastsOf(r.events, 2);
        expect(toasts.map((t) => t.type)).toEqual(['letter', 'checkpoint']);
        pump.add(toasts);
        frames++;
      }
    }
    expect(frames).toBe(1);
    at(10000);
    expect(pushes).toHaveLength(2);
    expect(pushes[1].at - pushes[0].at).toBe(TOAST_GAP_MS);
    for (const n of newest(pushes)) expect(n).toBeGreaterThanOrEqual(TOAST_GAP_MS);
  });

  it('a burst of five in one frame: each becomes the newest at its own time, 1.5 s apart, none dropped or pushed twice', () => {
    const burst: Toast[] = [
      { type: 'recorded', text: 'R1' }, { type: 'filed', text: 'F' }, { type: 'checkpoint', text: 'C' }, { type: 'held', text: 'H' }, { type: 'lap', text: 'L' },
    ];
    const { pump, pushes, at } = island();
    pump.add(burst);
    at(12000);
    expect(pushes.map((p) => [p.at, p.text])).toEqual(burst.map((t, k) => [k * TOAST_GAP_MS, t.text]));
  });

  it('a later frame after the queue has emptied still pushes, at once if the gap has run', () => {
    const toasts = prologuePair();
    const { pump, pushes, at } = island();
    pump.add(toasts);
    at(10000);
    pump.add(toasts);
    at(12000);
    pump.add([{ type: 'filed', text: 'F' }]);
    at(20000);
    expect(pushes.map((p) => p.at)).toEqual([0, TOAST_GAP_MS, 10000, 10000 + TOAST_GAP_MS, 10000 + 2 * TOAST_GAP_MS]);
  });

  it('paused 300 ms after a same-frame pair: the second is not pushed until the game resumes, then once the gap has run', () => {
    const toasts = prologuePair();
    // Paused for 7 s: the checkpoint waits under the pause panel and goes out on the resume, at once (its gap has run).
    const long = island();
    long.pump.add(toasts);
    long.at(300);
    long.pump.hold(true);
    long.at(7300);
    expect(long.pushes.map((p) => p.at)).toEqual([0]);
    long.pump.hold(false);
    long.at(12000);
    expect(long.pushes.map((p) => [p.at, p.text])).toEqual([[0, toasts[0].text], [7300, toasts[1].text]]);
    // Paused for half a second: on the resume it still waits out the gap from the last push.
    const short = island();
    short.pump.add(toasts);
    short.at(300);
    short.pump.hold(true);
    short.at(800);
    short.pump.hold(false);
    short.at(6000);
    expect(short.pushes.map((p) => p.at)).toEqual([0, TOAST_GAP_MS]);
    // A frame's toasts that come while paused wait too.
    const during = island();
    during.pump.hold(true);
    during.pump.add(toasts);
    during.at(5000);
    expect(during.pushes).toEqual([]);
    during.pump.hold(false);
    during.at(9000);
    expect(during.pushes.map((p) => p.at)).toEqual([5000, 5000 + TOAST_GAP_MS]);
  });

  it('clearing the play view empties the queue: nothing waiting reaches the next play, whose first toast goes at once', () => {
    const toasts = prologuePair();
    const { pump, pushes, at } = island();
    pump.add(toasts);
    at(300);
    // resetPlay clears the island's timers with the pump; here the pump's timer is left behind, and still nothing waiting
    // goes out, nor anything early.
    pump.clear();
    at(1000);
    pump.add([{ type: 'filed', text: 'F' }]);
    at(9000);
    expect(pushes.map((p) => [p.at, p.text])).toEqual([[0, toasts[0].text], [1000, 'F']]);
  });

  it('the queue is bounded by wall and held toasts giving way, oldest first; a record, filed, letter, gate, lap, checkpoint, replay\'s end or free lap toast is never dropped', () => {
    const keep: Toast['type'][] = ['recorded', 'filed', 'letter', 'gate', 'lap', 'checkpoint', 'replayDone', 'freeLap'];
    // The chariot leans on the edge and the ranks every frame for 3 s while the lakon's own toasts come.
    const { pump, pushes, at } = island();
    const sent: string[] = [];
    for (let k = 0; k < 180; k++) {
      at(k * 16);
      const toasts: Toast[] = [k % 2 === 0 ? { type: 'wall', text: `W${k}` } : { type: 'held', text: `H${k}` }];
      if (k % 30 === 0) toasts.push({ type: keep[(k / 30) % keep.length], text: `K${k}` });
      sent.push(...toasts.filter((t) => t.text.startsWith('K')).map((t) => t.text));
      pump.add(toasts);
    }
    at(40000);
    // Every lakon toast was shown, in order; the wall and held toasts gave way, far fewer than came.
    expect(pushes.filter((p) => p.text.startsWith('K')).map((p) => p.text)).toEqual(sent);
    expect(pushes.filter((p) => !p.text.startsWith('K')).length).toBeLessThan(10);
    for (let i = 1; i < pushes.length; i++) expect(pushes[i].at - pushes[i - 1].at).toBeGreaterThanOrEqual(TOAST_GAP_MS);
    // When only lakon toasts wait, none is dropped even past the bound; nor roam's.
    const many = Array.from({ length: TOAST_QUEUE_MAX + 3 }, (_, k): Toast => ({ type: 'recorded', text: `R${k}` }));
    expect(queueToasts(EMPTY_TOASTS, many).waiting).toHaveLength(TOAST_QUEUE_MAX + 3);
    const roam = Array.from({ length: TOAST_QUEUE_MAX + 3 }, (_, k): Toast => ({ type: k % 2 === 0 ? 'freeLap' : 'replayDone', text: `F${k}` }));
    expect(queueToasts(EMPTY_TOASTS, roam).waiting).toHaveLength(TOAST_QUEUE_MAX + 3);
    // One over the bound: the oldest droppable one gives way, the newer stays.
    const mixed: Toast[] = [{ type: 'wall', text: 'old' }, ...many.slice(0, TOAST_QUEUE_MAX - 1), { type: 'held', text: 'new' }];
    expect(queueToasts(EMPTY_TOASTS, mixed).waiting.map((t) => t.text)).toEqual([...many.slice(0, TOAST_QUEUE_MAX - 1).map((t) => t.text), 'new']);
  });

  it('the island runs this pump: its toasts go through it, it holds while paused, and resetPlay clears it', () => {
    const src = readFileSync('src/components/BowobharataGame.tsx', 'utf8');
    expect(TOAST_GAP_MS).toBe(1500);
    expect(src).toContain('const TOAST_MAX = 2;');
    expect(src).toContain('const TOAST_MS = 4000;');
    // One pump for the island's life, made on its first render: a pump made afresh on each render would forget its queue,
    // the time of its last push (the 1.5 s gap) and whether the game is paused.
    expect(src).toContain('const [pump] = useState(() => toastPump({ now: () => performance.now(), schedule: later, push: (t) => pushToast(t.text) }));');
    expect(src.match(/toastPump\(/g)).toHaveLength(1);
    expect(src.match(/pushToast\(/g)).toHaveLength(1);
    expect(src).toMatch(/pump\.add\(toasts\);/);
    // It holds on every pause and lets go on every resume: the effect runs whenever flow.paused changes.
    expect(src).toMatch(/useEffect\(\(\) => \{\s*pump\.hold\(flow\.paused\);\s*\}, \[flow\.paused, pump\]\);/);
    const reset = /const resetPlay = \(\) => \{([\s\S]*?)\n  \};/.exec(src)?.[1] ?? '';
    expect(reset).toContain('timers.current.clear();');
    expect(reset).toContain('pump.clear();');
    // Leaving play, and every new play, runs resetPlay: no toast from one play waits into the next screen or play.
    expect(src).toMatch(/if \(!playing3d\) resetPlay\(\);/);
    expect(src).toMatch(/else if \(flow\.screen === 'play' && data\) \{\s*resetPlay\(\);/);
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

  it("gives the pause panel its way out of a replay only while the live state, read as the game pauses, is in a replay's intro or active part: the runtime leaves the replay, then the play resumes (Task 38)", async () => {
    // The offer reads the runtime's live state, not the HUD's last snapshot, which can lag the engine by 0.1 s into a
    // replay's outro or fail shot (fix round 2, R2-1).
    expect(src).toContain('onLeaveReplay={leaveOffered(runtimeRef.current?.state()) ? leaveReplay : undefined}');
    expect(callArgs('leaveOffered')).toEqual(['runtimeRef.current?.state()']);
    // ...and it is read in the render that pauses (fix round 3, R3-2): the one Paused element sits inline in the JSX block
    // that renders on the pause, the offer among its props, and no memo or callback builds the panel or reads the offer,
    // which would freeze it at the last snapshot or at mount.
    expect(src.match(/<Paused\b/g)).toHaveLength(1);
    expect(src).toMatch(/\{playing3d && flow\.paused && \(\s*<Paused\b(?:(?!\/>)[\s\S])*?onLeaveReplay=\{leaveOffered\(runtimeRef\.current\?\.state\(\)\) \? leaveReplay : undefined\}(?:(?!\/>)[\s\S])*?\/>\s*\)\}/);
    for (const hook of ['useMemo', 'useCallback']) {
      for (const args of callArgs(hook)) {
        expect(args, hook).not.toContain('<Paused');
        expect(args, hook).not.toContain('leaveOffered(');
      }
    }
    // Offered in a replay's intro and its active part; never in its outro (it ends by itself within 2.5 s and keeps its
    // score), its fail shot (it ends at 0 within 1.2 s anyway), roam, or a chapter's own lakon (fix round 1, F3).
    const { leaveOffered } = await import('../src/lib/bowobharata-game/hud');
    // It reads the run's phase and whether a replay is aside, alone.
    const at = (phase: Phase, replay: boolean) =>
      leaveOffered({ run: { phase }, roam: { aside: replay ? {} : null } } as unknown as Pick<GameState, 'run' | 'roam'>);
    expect(leaveOffered(null)).toBe(false);
    expect(leaveOffered(undefined)).toBe(false);
    expect(leaveOffered({ run: { phase: 'intro' }, roam: null } as unknown as Pick<GameState, 'run' | 'roam'>)).toBe(false);
    for (const phase of ['roam', 'intro', 'active', 'outro', 'failed', 'done'] as const) {
      expect([phase, at(phase, true)]).toEqual([phase, phase === 'intro' || phase === 'active']);
      expect([phase, at(phase, false)]).toEqual([phase, false]);
    }
    expect(src).toMatch(/const leaveReplay = \(\) => \{\s*runtimeRef\.current\?\.leave\(\);\s*dispatch\(\{ type: 'togglePause' \}\);\s*\};/);
    expect(callArgs('leave')).toEqual(['']);
    expect(src.split('onLeaveReplay=').length - 1).toBe(1);
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

  it('never stores the settings, the bests or the best lap: no writeSaved( call passes them', () => {
    const calls = callArgs('writeSaved');
    expect(calls).toHaveLength(2);
    for (const args of calls) {
      expect(args).not.toMatch(/settings/i);
      expect(args).not.toMatch(/bests|bestLap/);
    }
    // What it does store is Saved's two fields.
    expect(calls).toEqual(['storage(), { best: flow.best, chapter: flow.chapter }', 'storage(), { best: flow.best, chapter: 0 }']);
  });

  it('the tap game is gone: no pick, wave, catch, pose or linimasa import', () => {
    for (const s of ['pickNearest', 'PARVA_POSES', 'buildWave(', 'catchArrow(', 'catchItems(', 'linimasa-locale', 'parvaEvents(']) {
      expect(src, s).not.toContain(s);
    }
  });

  it('the screens keep none of it either: no catch items, linimasa import or parva events in screens.tsx (Task 37)', () => {
    const screens = readFileSync('src/components/bowobharata-game/screens.tsx', 'utf8');
    for (const s of ['catchItems', 'CatchItem', 'linimasa-locale', 'parvaEvents(']) expect(screens, s).not.toContain(s);
  });

  it('drives the runtime by screen: orbit on the intro, start (or retry after a fail) on play, the finale on the finale', () => {
    expect(src).toContain("if (flow.screen === 'intro') rt.orbit();");
    expect(src).toContain("else if (flow.screen === 'finale') rt.finale();");
    // A retry only on the runtime that failed: a new one has no checkpoint, so it starts the chapter afresh.
    expect(src).toContain("const fromLost = last.rt === rt && last.screen === 'lost';");
    // Each chapter with roam's data (Task 36): every chapter before it finished, the session's bests and best lap, and any
    // chapter's slugs, for its replay and for parva 5's posts.
    expect(src).toContain('const slugsOf = (c: number) => (data.events[c] ?? []).map((e) => e.slug);');
    expect(src).toMatch(
      /const roam: RoamOpts = \{\s*finished: Array\.from\(\{ length: flow\.chapter \}, \(_, k\) => k\),\s*bests: bests\.current,\s*bestLap: bestLap\.current,\s*slugsOf,\s*\};/,
    );
    expect(src).toMatch(/if \(fromLost\) rt\.retry\(\);\s*else rt\.start\(flow\.chapter, slugsOf\(flow\.chapter\), seed, roam\);/);
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

  it('a replay ends back in roam with no new screen: replayDone keeps its best for the session and puts the letterbox away, never with playResult or skip; a free lap keeps the best lap (Task 36, rulings 7 and 10)', () => {
    /** A case's body in onEvents, up to its break. */
    const caseOf = (type: string) => src.match(new RegExp(`case '${type}':([\\s\\S]*?)break;`))?.[1] ?? '';
    const replay = caseOf('replayDone');
    expect(replay).toContain('keepBest(e.chapter, e.best);');
    // The card, the letterbox and the wipe all go, as at introEnd: a replay left in its intro takes its card with it, and
    // the next introStart opens them afresh (Task 38, fix round 1, F1).
    expect(replay).toContain('hideMission();');
    expect(replay).not.toContain('setCine(');
    for (const x of ['playResult', "type: 'skip'", 'failClock', 'writeSaved', 'dispatch(']) expect(replay, x).not.toContain(x);
    expect(caseOf('freeLap')).toContain('bestLap.current = e.best;');
    expect(caseOf('freeLap')).not.toContain('dispatch(');
    // A play's own end keeps its score as the chapter's best too, so a replay's best is measured against it.
    expect(caseOf('done')).toMatch(/dispatch\(\{ type: 'playResult', result: 'won', score: e\.score \}\);\s*keepBest\(flowRef\.current\.chapter, e\.score\);/);
    // playResult comes only from a lakon's own end, its fail shot and the version without animation; skip only from the
    // fail card. The engine passes a replay's failed on to no one (ruling 10), so no fail clock starts for it.
    expect(src.match(/type: 'playResult'/g)).toHaveLength(3);
    expect(src.match(/dispatch\(\{ type: 'skip' \}\)/g)).toHaveLength(1);
    // The session's bests: each chapter's, and the best lap; never written to storage.
    expect(src).toContain('const bests = useRef<number[]>([]);');
    expect(src).toContain('const bestLap = useRef<number | null>(null);');
    expect(src).toMatch(/const keepBest = \(chapter: number, score: number\) => \{\s*bests\.current\[chapter\] = Math\.max\(bests\.current\[chapter\] \?\? 0, score\);\s*\};/);
  });

  it("keeps F1's way out whole: replayDone always calls hideMission, hideMission does its four things, and onEvents, wired to the runtime as it is, takes every event while the game is paused, the leave's replayDone too (Task 38, fix round 2, R2-4; fix round 3, R3-1)", () => {
    /** Code without its line comments. */
    const code = (t: string) => t.replace(/\/\/[^\n]*\n/g, '\n');
    /** The body of the block that `head` opens (`head` ends at its opening brace), read to the matching brace. */
    const bodyOf = (head: string): string => {
      const at = src.indexOf(head);
      expect(at, head).toBeGreaterThanOrEqual(0);
      const from = at + head.length;
      let depth = 1;
      let i = from;
      for (; i < src.length && depth > 0; i++) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0;
      return src.slice(from, i - 1);
    };
    // The case is the two statements, unguarded: a leave at any score takes the card.
    const replay = src.match(/case 'replayDone':([\s\S]*?)break;/)?.[1] ?? '';
    expect(code(replay)).toMatch(/^\s*keepBest\(e\.chapter, e\.best\);\s*hideMission\(\);\s*$/);
    // All four go, in any order, comments allowed: with missionUp left true the next introStart would open nothing, and a
    // wipe left set would replay.
    const hide = code(bodyOf('const hideMission = () => {')).split(';').map((x) => x.trim()).filter(Boolean).sort();
    expect(hide).toEqual(['missionUp.current = false', 'setCine(false)', 'setMission(false)', 'setWipe(null)']);
    // The leave runs from the pause panel, so its replayDone arrives while the game is paused. Over onEvents's whole body:
    // its one return is the screen check that opens it, and it reads no paused flag and skips no event.
    const events = code(bodyOf('const onEvents = (events: readonly GameEvent[]) => {'));
    expect(events).toContain('pump.add(toasts);');
    expect(events.trimStart().startsWith("if (flowRef.current.screen !== 'play') return;")).toBe(true);
    expect(events.match(/\breturn\b/g)).toEqual(['return']);
    expect(events).not.toMatch(/\bpaused\b|\bcontinue\b/);
    // And every event reaches it: the runtime calls the latest render's handler, and that handler is onEvents itself.
    expect(src).toContain('onEvents: (e) => handlers.current.onEvents(e),');
    expect(src).toContain('handlers.current = { onHud, onEvents, readInput };');
    expect(src.match(/handlers\.current = /g)).toHaveLength(1);
  });

  it('shows the lakon card and the cinema on introStart and on a chapter that starts in its intro; introEnd hides both; outroStart brings the bars back', () => {
    expect(src).toMatch(/case 'introStart':\s*showMission\(\);/);
    expect(src).toMatch(/case 'introEnd':\s*hideMission\(\);/);
    expect(src).toMatch(/case 'outroStart':\s*setCine\(true\);/);
    // The prologue begins in its intro, so no introStart comes for it: its first HUD snapshot opens the card instead.
    expect(src).toMatch(/if \(first\.current\) \{\s*first\.current = false;\s*if \(h\.phase === 'intro'\) showMission\(\);/);
    // The lakon running names the card: a replay's own chapter, not the play's (Task 36). It sits alone in its box, the
    // stage-sized container its padding trim queries (fix round 2, R2-5).
    expect(src).toMatch(/<MissionCard locale=\{locale\} chapterIndex=\{hud\.chapter\} type=\{hud\.type\} \/>/);
    expect(src).toMatch(/<div className="bg-cardbox">\s*<MissionCard locale=\{locale\} chapterIndex=\{hud\.chapter\} type=\{hud\.type\} \/>\s*<\/div>/);
    expect(src.split('bg-cardbox').length - 1).toBe(1);
    // The gunungan wipe: in at the intro's start, out shortly after.
    expect(src).toContain('<div className="bg-wipe" aria-hidden="true" />');
    // One attribute change per transition ('a' and 'b' alternate so the CSS animation restarts): no second flip.
    expect(src).toMatch(/setWipe\(\(w\) => \(w === 'a' \? 'b' : 'a'\)\);/);
    expect(src).not.toContain('WIPE_HOLD_MS');
    expect(src).not.toContain("setWipe('out')");
    expect(src).toMatch(/data-cine=\{playing3d && cine \? 'on' : undefined\}/);
    expect(src).toMatch(/data-play=\{playing3d \? 'on' : undefined\}/);
  });

  it('turns the eleven toast events into at most two toasts of 4 s each, through toastText', () => {
    expect(src).toContain(
      "new Set<GameEvent['type']>(['recorded', 'filed', 'rewriteTaken', 'held', 'checkpoint', 'wall', 'gate', 'letter', 'lap', 'replayDone', 'freeLap'])",
    );
    expect(src).toContain('const TOAST_MAX = 2;');
    expect(src).toContain('const TOAST_MS = 4000;');
    // The frame's events go along, so a rewrite gate's toast covers its rewriteTaken; the chapter is the lakon's, and so are
    // the cards a record's date and channel come from (a replay's own, Task 36).
    expect(src).toMatch(/toastText\(e, locale, lakonChapter\(\), cardOf, events\)/);
    expect(src).toMatch(/const lakonChapter = \(\) => runtimeRef\.current\?\.state\(\)\?\.run\.def\.chapter \?\? flowRef\.current\.chapter;/);
    // cardOf, whole: a record's date and channel and nothing else, from the event cards of the lakon's own chapter. The
    // tests make their toasts with cardOfIn (bowobharata-game-sweep.ts), which returns the same, from the same line.
    const RETURN = 'return e ? { date: e.dateLabel[locale], channel: e.channel[locale] } : null;';
    expect(src.match(/\n {2}const cardOf = [\s\S]*?\n {2}\};\n/)?.[0]).toBe(
      `\n  const cardOf = (card: number) => {\n    const e = dataRef.current?.events[lakonChapter()]?.[card];\n    ${RETURN}\n  };\n`,
    );
    expect(readFileSync('tests/bowobharata-game-sweep.ts', 'utf8').match(/\nexport const cardOfIn = [\s\S]*?\n\};\n/)?.[0]).toBe(
      '\nexport const cardOfIn = (events: readonly (readonly EventCard[])[], chapter: number, locale: Locale) => (card: number) => {\n' +
        `  const e = events[chapter]?.[card];\n  ${RETURN}\n};\n`,
    );
    // Every toast event gets its line, whatever else its case does.
    expect(src).toMatch(/\n {6}if \(TOASTED\.has\(e\.type\)\) \{\s*const text = toastText\(/);
    expect(src).toContain('.slice(-TOAST_MAX)');
    // The newest toast is always the region's last child, which the short-stage CSS never hides (Task 34): it is added
    // whole, so the polite live region speaks it; an older one is hidden only after it has been read.
    expect(src).toContain('[...list, { id, text }].slice(-TOAST_MAX)');
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
  it('hands the chapter reports to Tercatat, Sanjaya and the finale: the report, the chapter ids and whether 3D is allowed', () => {
    expect(src).toContain("const allow3d = flow.mode === '3d';");
    expect(src).toContain('data.chapters.map((c) => c.entries.map((e) => e.id))');
    const tagOf = (name: string) => src.match(new RegExp(`<${name}\\b[\\s\\S]*?\\/>`))?.[0] ?? '';
    expect(tagOf('Recorded')).toContain('report={data.report}');
    for (const name of ['SanjayaReport', 'Finale']) {
      const tag = tagOf(name);
      for (const prop of ['report={data.report}', 'chapterIds={chapterIds}', 'allow3d={allow3d}']) expect(tag, `${name} ${prop}`).toContain(prop);
    }
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

  it('brings the game back under the header after a screen change that left its top above it (C-ISLAND-1), with a scroll margin', () => {
    // Comments become spaces, so a commented-out line does not pass.
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => ' '.repeat(c.length));
    const effect = code.match(/useEffect\(\(\) => \{\s*if \(!shownOnce\.current\) \{[\s\S]*?\n {2}\}, \[flow\.screen, flow\.chapter\]\);/)?.[0] ?? '';
    expect(effect, 'the effect on [flow.screen, flow.chapter] that skips the first render').not.toBe('');
    expect(effect).toMatch(/shownOnce\.current = true;\s*return;/);
    expect(effect).toMatch(/flow\.screen === 'gate' \|\| \(flow\.screen === 'play' && flowRef\.current\.mode === '3d'\)\) return;/);
    expect(effect).toContain("document.querySelector('.nav')");
    expect(effect).toMatch(/if \(game\.getBoundingClientRect\(\)\.top < navBottom\) game\.scrollIntoView\(\{ block: 'start', behavior: 'auto' \}\);/);
    expect(effect).toMatch(/const game = gameRef\.current;/);
    const css = readFileSync('src/styles/bowobharata-game.css', 'utf8');
    expect(css).toMatch(/^\.bg-game \{[^}]*scroll-margin-top: var\(--nav-h, 59px\);/m);
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

describe('a replay in play (Task 36, ruling 11, decisions 1 and 2)', () => {
  // The island renders <MissionCard chapterIndex={hud.chapter} .../> and makes each toast with lakonChapter(), the chapter
  // of the runtime's state, whose event cards cardOf reads (the source pins above). Here the engine plays a replay of parva
  // 1 from chapter 3's roam, and the card and the toasts are made from its snapshots and states as the island makes them.
  const w = createWorld({ mobile: false });
  const slugsOf = (c: number) => game.events[c].map((e) => e.slug);
  const defOf = (c: number) => missionFor(c, slugsOf(c));
  /** Chapter 3's roam, 14 m west of parva 1's marker, driven east at up to 6 m/s until the replay starts. */
  function replayOf1(): GameState {
    const m1 = defOf(1).marker!;
    let s = startChapter(defOf(3), { x: m1.x - 14, z: m1.z, yaw: 0 }, 1, w, { finished: [0, 1, 2], bests: [], bestLap: null, defOf });
    for (let k = 0; k < 300 && s.run.def.chapter === 3; k++) {
      const drive = { ...NO_INPUT, throttle: speedOf(s.car) < 6 ? 1 : 0 };
      s = advance(s, { drive, sight: false, skip: false, assist: false, aspect: DEFAULT_ASPECT }, 1 / 30, w).state;
    }
    expect(s.run.def.chapter).toBe(1);
    return s;
  }

  it("a replay of parva 1 from chapter 3's roam shows parva 1's lakon card", () => {
    const hud = hudOf(replayOf1(), w);
    expect([hud.chapter, hud.phase, hud.replay]).toEqual([1, 'intro', true]);
    for (const locale of ['id', 'en'] as const) {
      const card = renderToString(<MissionCard locale={locale} chapterIndex={hud.chapter} type={hud.type} />);
      expect(card).toContain(esc(chapterInfo(1, locale).title));
      expect(card).not.toContain(esc(chapterInfo(3, locale).title));
    }
  });

  it("its record toasts read parva 1's event cards: each record's own date and channel", () => {
    let s = replayOf1();
    const bot = createBot();
    const toasts: { card: number; id: string; en: string }[] = [];
    for (let k = 0; k < 150 * 30 && s.run.def.chapter === 1; k++) {
      const r = advance(s, bot(s, w), 1 / 30, w);
      s = r.state;
      for (const e of r.events) {
        if (e.type !== 'recorded') continue;
        // As the island's cardOf: a record's date and channel from the event cards of the lakon's own chapter.
        const [id, en] = (['id', 'en'] as const).map((l) => toastText(e, l, s.run.def.chapter, cardOfIn(game.events, s.run.def.chapter, l), r.events));
        toasts.push({ card: e.card, id: id!, en: en! });
      }
    }
    expect(s.run.def.chapter).toBe(3);
    expect(toasts.map((t) => t.card)).toEqual([0, 1]);
    // Chapter 3's own cards say otherwise: a toast made from the play's chapter would show their dates.
    for (const k of [0, 1]) expect(game.events[3][k].dateLabel.en).not.toBe(game.events[1][k].dateLabel.en);
    for (const t of toasts) {
      const card = game.events[1][t.card];
      expect(t.id).toBe(GAME_COPY.id.toasts.recorded({ n: t.card + 1, total: 2, date: card.dateLabel.id, channel: card.channel.id }));
      expect(t.en).toBe(GAME_COPY.en.toasts.recorded({ n: t.card + 1, total: 2, date: card.dateLabel.en, channel: card.channel.en }));
    }
  }, 30_000);
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

import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, type ReactElement } from 'react';
import type { Root } from 'react-dom/client';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { GAME_DATA_SRC } from '../src/lib/bowobharata-game/data';
import type { Perkara } from '../src/lib/perkara';
import { PARVAS } from '../src/lib/bowobharata';
import { fakePage, type FakeElement, type FakePage } from './bowobharata-game-dom';

// The island and the pause panel mounted with react-dom/client on the small document of bowobharata-game-dom.ts, so their
// effects run: the data request's outcomes (a payload of the wrong shape, a request that never answers) and the pause
// panel's focus. The 3D scene never loads here: the island runs the version without animation (reduced motion).

const game = gameData(JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara);
const COUNT = PARVAS.length + 2;

let page: FakePage;
let createRoot: typeof import('react-dom/client').createRoot;
let BowobharataGame: typeof import('../src/components/BowobharataGame').default;
let gameDataOf: typeof import('../src/components/BowobharataGame').gameDataOf;
let Paused: typeof import('../src/components/bowobharata-game/screens').Paused;
let root: Root | null = null;

beforeAll(async () => {
  // react-dom reads `window` as it loads, so the page goes in first.
  page = fakePage({ reduced: true });
  page.install();
  ({ createRoot } = await import('react-dom/client'));
  ({ default: BowobharataGame, gameDataOf } = await import('../src/components/BowobharataGame'));
  ({ Paused } = await import('../src/components/bowobharata-game/screens'));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  for (const c of [...page.doc.body.childNodes]) page.doc.body.removeChild(c);
  page.doc.activeElement = page.doc.body;
  page.storage.clear();
  vi.unstubAllGlobals();
});

async function mount(el: ReactElement): Promise<FakeElement> {
  const host = page.doc.createElement('div');
  page.doc.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  await act(async () => root!.render(el));
  return host;
}
const button = (host: FakeElement, text: string) => host.querySelectorAll('button').find((b) => b.textContent === text) ?? null;
async function press(host: FakeElement, text: string) {
  const b = button(host, text);
  expect(b, `a button "${text}"`).not.toBeNull();
  await act(async () => b!.click());
}
/** Start, then the prologue's Play: the play screen, where the data is first needed. */
async function toPlay(host: FakeElement, locale: 'id' | 'en') {
  await press(host, GAME_COPY[locale].gateStart);
  await press(host, GAME_COPY[locale].actions.play);
}
const response = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('the data request (d-pages-2, d-pages-3)', () => {
  it('gameDataOf takes the built payload and refuses {}, [], null and payloads short of the game\'s shape', () => {
    expect(gameDataOf(game, COUNT)).toBe(game);
    expect(gameDataOf(JSON.parse(JSON.stringify(game)), COUNT)).not.toBeNull();
    for (const bad of [{}, [], null, 'x', 7, { ...game, chapters: game.chapters.slice(1) }, { ...game, events: {} }, { ...game, prologue: null },
      { ...game, totals: [] }, { ...game, report: undefined }]) expect(gameDataOf(bad, COUNT)).toBeNull();
  });

  for (const body of [{}, [], null] as const) {
    it(`a 200 answer of ${JSON.stringify(body)} shows the data error and its retry, not a blank island`, async () => {
      const fetch = vi.fn(() => response(body));
      vi.stubGlobal('fetch', fetch);
      const host = await mount(<BowobharataGame locale="id" />);
      expect(fetch).toHaveBeenCalledWith(GAME_DATA_SRC, expect.objectContaining({ signal: expect.any(AbortSignal) }));
      await toPlay(host, 'id');
      const alert = host.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(GAME_COPY.id.dataError.message);
      expect(button(host, GAME_COPY.id.dataError.retry)).not.toBeNull();
      expect(host.querySelector('.bg-loading')).toBeNull();
      // The retry asks again, and a good answer then plays.
      fetch.mockImplementation(() => response(game));
      await press(host, GAME_COPY.id.dataError.retry);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(host.querySelector('[role="alert"]')).toBeNull();
      expect(host.querySelector('.bg-fallback')).not.toBeNull();
    });
  }

  it('a request that never answers shows one loading line in a polite live region, in both languages', async () => {
    for (const locale of ['id', 'en'] as const) {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      const host = await mount(<BowobharataGame locale={locale} />);
      // The gate and the intro need no data, and say nothing of it.
      expect(host.querySelector('.bg-loading')).toBeNull();
      await toPlay(host, locale);
      const lines = host.querySelectorAll('.bg-loading');
      expect(lines).toHaveLength(1);
      expect(lines[0].getAttribute('role')).toBe('status');
      expect(lines[0].getAttribute('aria-live')).toBe('polite');
      expect(lines[0].textContent).toBe(GAME_COPY[locale].dataError.loading);
      expect(host.querySelector('[role="alert"]')).toBeNull();
      await act(async () => root!.unmount());
      root = null;
    }
  });

  it('the request carries a 20 s timeout, whose abort ends in the data error and its retry', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    let fail: (e: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_, reject) => { fail = reject; })));
    const host = await mount(<BowobharataGame locale="en" />);
    expect(timeout).toHaveBeenCalledWith(20000);
    await toPlay(host, 'en');
    expect(host.querySelector('.bg-loading')).not.toBeNull();
    await act(async () => fail(new DOMException('The operation timed out.', 'TimeoutError')));
    expect(host.querySelector('.bg-loading')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(GAME_COPY.en.dataError.message);
    timeout.mockRestore();
  });
});

describe('the pause panel takes the focus (C-ISLAND-4)', () => {
  const settings = { assist: false, easy: false };
  /** A stage with the HUD's Pause and, while `open`, the panel: as the island lays them out. */
  const Stage = ({ open, locale }: { open: boolean; locale: 'id' | 'en' }) => (
    <div className="bg-stage">
      <div className="bg-hud"><div className="bg-objective"><div className="bg-actions">
        <button type="button" className="btn">{GAME_COPY[locale].hud.pause}</button>
      </div></div></div>
      {open && <Paused locale={locale} onResume={() => {}} settings={settings} onSettings={() => {}} onUseStill={() => {}} />}
    </div>
  );

  it('focuses Resume as it opens, without scrolling, and gives the focus back to the HUD\'s Pause as it closes', async () => {
    for (const locale of ['id', 'en'] as const) {
      const host = await mount(<Stage open={false} locale={locale} />);
      const hudPause = host.querySelector('.bg-hud .btn')!;
      expect(page.doc.activeElement).toBe(page.doc.body);
      await act(async () => root!.render(<Stage open locale={locale} />));
      const resume = button(host, GAME_COPY[locale].actions.resume)!;
      expect(page.doc.activeElement).toBe(resume);
      expect(resume.focusCalls).toEqual([{ preventScroll: true }]);
      await act(async () => root!.render(<Stage open={false} locale={locale} />));
      expect(page.doc.activeElement).toBe(hudPause);
      expect(hudPause.focusCalls).toEqual([{ preventScroll: true }]);
      await act(async () => root!.unmount());
      root = null;
      page.doc.activeElement = page.doc.body;
    }
  });

  it('gives the focus back to what held it before the pause, when that is still in the page', async () => {
    const host = await mount(<Stage open={false} locale="id" />);
    const hudPause = host.querySelector('.bg-hud .btn')!;
    const other = page.doc.createElement('button');
    page.doc.body.appendChild(other);
    other.focus();
    await act(async () => root!.render(<Stage open locale="id" />));
    expect(page.doc.activeElement).toBe(button(host, GAME_COPY.id.actions.resume));
    await act(async () => root!.render(<Stage open={false} locale="id" />));
    expect(page.doc.activeElement).toBe(other);
    expect(hudPause.focusCalls).toEqual([]);
  });
});

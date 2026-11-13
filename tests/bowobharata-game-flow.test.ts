import { describe, it, expect } from 'vitest';
import { PARVAS } from '../src/lib/bowobharata';
import { initFlow, reduce, readSaved, writeSaved, type FlowEvent, type FlowState, type Settings } from '../src/lib/bowobharata-game/flow';

/** The prologue, each parva and the finale. */
const COUNT = PARVAS.length + 2;
const at = (s: Partial<FlowState>): FlowState => ({ ...initFlow(COUNT, {}), ...s });
const run = (s: FlowState, ...events: FlowEvent[]): FlowState => events.reduce(reduce, s);
const won = (score: number): FlowEvent => ({ type: 'playResult', result: 'won', score });
const lost: FlowEvent = { type: 'playResult', result: 'lost', score: 0 };

describe('flow reducer', () => {
  it('3D: gate → intro → play → recorded → sanjaya → intro(1)', () => {
    let s = initFlow(COUNT, {});
    expect(s).toMatchObject({ screen: 'gate', mode: '3d', fails: 0 });
    s = reduce(s, { type: 'start' });
    expect(s).toMatchObject({ screen: 'intro', chapter: 0 });
    s = reduce(s, { type: 'next' });
    expect(s.screen).toBe('play');
    s = reduce(s, won(300));
    expect(s).toMatchObject({ screen: 'recorded', chapter: 0, best: 300 });
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'sanjaya', chapter: 0 });
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'intro', chapter: 1 });
  });

  it('fallback: play → sanjaya, with no Tercatat screen between', () => {
    const s = reduce(at({ screen: 'play', chapter: 2, mode: 'fallback' }), won(0));
    expect(s).toMatchObject({ screen: 'sanjaya', chapter: 2, mode: 'fallback' });
  });

  it('a loss shows lost and adds 1 to fails; retry replays the same chapter', () => {
    let s = reduce(at({ screen: 'play', chapter: 4 }), lost);
    expect(s).toMatchObject({ screen: 'lost', chapter: 4, fails: 1 });
    s = reduce(s, { type: 'retry' });
    expect(s).toMatchObject({ screen: 'play', chapter: 4, fails: 1 });
    s = reduce(s, lost);
    expect(s).toMatchObject({ screen: 'lost', chapter: 4, fails: 2 });
  });

  it('skip is ignored at fails 1 and goes to recorded at fails 2', () => {
    const once = reduce(at({ screen: 'play', chapter: 3 }), lost);
    expect(once.fails).toBe(1);
    expect(reduce(once, { type: 'skip' })).toEqual(once);
    const twice = run(once, { type: 'retry' }, lost);
    expect(twice).toMatchObject({ screen: 'lost', fails: 2 });
    expect(reduce(twice, { type: 'skip' })).toMatchObject({ screen: 'recorded', chapter: 3, fails: 2 });
    // Only the fail card offers the skip: on any other screen it changes nothing.
    for (const screen of ['intro', 'play', 'recorded', 'sanjaya'] as const) {
      const s = at({ screen, chapter: 3, fails: 2 });
      expect(reduce(s, { type: 'skip' })).toEqual(s);
    }
  });

  it('fails is 0 at the next intro', () => {
    let s = run(at({ screen: 'play', chapter: 3 }), lost, { type: 'retry' }, lost, { type: 'skip' });
    expect(s).toMatchObject({ screen: 'recorded', chapter: 3, fails: 2 });
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'sanjaya', fails: 2 });
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'intro', chapter: 4, fails: 0 });
    expect(reduce(at({ screen: 'gate', fails: 3 }), { type: 'start' })).toMatchObject({ screen: 'intro', fails: 0 });
  });

  it('the finale has no play: intro → Sanjaya → finale', () => {
    let s = reduce(at({ screen: 'sanjaya', chapter: COUNT - 2 }), { type: 'next' });
    expect(s).toMatchObject({ screen: 'intro', chapter: COUNT - 1 });
    s = reduce(s, { type: 'next' });
    expect(s.screen).toBe('sanjaya');
    s = reduce(s, { type: 'next' });
    expect(s).toMatchObject({ screen: 'finale', chapter: COUNT - 1 });
  });

  it('useFallback switches to the version without animation and keeps the chapter and screen', () => {
    for (const screen of ['intro', 'play', 'recorded', 'sanjaya', 'lost'] as const) {
      const s = reduce(at({ screen, chapter: 5, mode: '3d', fails: 1, best: 200 }), { type: 'useFallback' });
      expect(s).toMatchObject({ screen, chapter: 5, mode: 'fallback', fails: 1, best: 200 });
    }
    expect(reduce(at({ screen: 'play', paused: true }), { type: 'useFallback' }).paused).toBe(false);
    const fb = at({ screen: 'play', mode: 'fallback' });
    expect(reduce(fb, { type: 'useFallback' })).toBe(fb);
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
});

describe('saved progress', () => {
  it('{ best, chapter } round-trips under bowobharata-game, no other key is written, and a throwing storage is safe', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage;
    // The island's settings live in its state for the session; even handed over, they never reach the storage.
    const settings: Settings = { assist: true, easy: true };
    const withSettings = { best: 400, chapter: 2, settings };
    writeSaved(store, withSettings);
    expect([...mem.keys()]).toEqual(['bowobharata-game']);
    expect(JSON.parse(mem.get('bowobharata-game')!)).toEqual({ best: 400, chapter: 2 });
    expect(readSaved(store)).toEqual({ best: 400, chapter: 2 });
    mem.set('bowobharata-game', JSON.stringify({ best: 7, chapter: 1, settings }));
    expect(readSaved(store)).toEqual({ best: 7, chapter: 1 });

    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(readSaved(broken)).toBeNull();
    expect(() => writeSaved(broken, { best: 1, chapter: 1 })).not.toThrow();
    expect(readSaved(undefined)).toBeNull();
  });
});

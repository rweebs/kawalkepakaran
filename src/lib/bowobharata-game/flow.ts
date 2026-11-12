// The game's screen flow as a pure reducer: gate, then per chapter intro → play → Sanjaya's report, then the finale.
// A lost chapter is replayed, never game over. Losing WebGL only changes the mode; the chapter and screen carry over.

export type Screen = 'gate' | 'intro' | 'play' | 'sanjaya' | 'lost' | 'finale';
export type Mode = '3d' | 'fallback';

export interface FlowState {
  screen: Screen;
  chapter: number;
  /** Number of chapters: prologue, each parva, finale. The finale is the last and has no play. */
  count: number;
  mode: Mode;
  paused: boolean;
  best: number;
}

export type FlowEvent =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'playResult'; result: 'won' | 'lost'; score: number }
  | { type: 'retry' }
  | { type: 'hidden' }
  | { type: 'visible' }
  | { type: 'contextLost' }
  | { type: 'togglePause' }
  | { type: 'restore'; chapter: number; best: number }
  | { type: 'restart' };

const clampChapter = (n: number, count: number) => Math.min(Math.max(0, Math.floor(n) || 0), count - 1);

export function initFlow(count: number, opts: { fallback?: boolean; chapter?: number; best?: number }): FlowState {
  return {
    screen: 'gate',
    chapter: clampChapter(opts.chapter ?? 0, count),
    count,
    mode: opts.fallback ? 'fallback' : '3d',
    paused: false,
    best: opts.best ?? 0,
  };
}

const go = (s: FlowState, screen: Screen, chapter = s.chapter): FlowState => ({ ...s, screen, chapter, paused: false });

export function reduce(s: FlowState, ev: FlowEvent): FlowState {
  const finale = s.count - 1;
  switch (ev.type) {
    case 'start':
      return s.screen === 'gate' ? go(s, 'intro') : s;
    case 'next':
      if (s.screen === 'intro') return go(s, s.chapter === finale ? 'sanjaya' : 'play');
      if (s.screen === 'sanjaya') return s.chapter === finale ? go(s, 'finale') : go(s, 'intro', s.chapter + 1);
      return s;
    case 'playResult':
      if (s.screen !== 'play') return s;
      return { ...go(s, ev.result === 'won' ? 'sanjaya' : 'lost'), best: Math.max(s.best, ev.score) };
    case 'retry':
      return s.screen === 'lost' ? go(s, 'play') : s;
    case 'hidden':
      return { ...s, paused: true };
    case 'visible':
      return s;
    case 'contextLost':
      return s.mode === 'fallback' ? s : { ...s, mode: 'fallback', paused: false };
    case 'togglePause':
      return s.screen === 'play' ? { ...s, paused: !s.paused } : s;
    case 'restore':
      return s.screen === 'gate' ? { ...s, chapter: clampChapter(ev.chapter, s.count), best: Math.max(0, ev.best || 0) } : s;
    case 'restart':
      return go(s, 'gate', 0);
  }
}

export interface Saved { best: number; chapter: number }
const KEY = 'bowobharata-game';

export function readSaved(storage: Storage | undefined): Saved | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    if (typeof v.best !== 'number' || typeof v.chapter !== 'number') return null;
    return { best: v.best, chapter: v.chapter };
  } catch {
    return null;
  }
}

export function writeSaved(storage: Storage | undefined, v: Saved): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ best: v.best, chapter: v.chapter }));
  } catch {
    /* storage blocked or full: the game simply does not remember */
  }
}

// BOWOBHARATA, the game island. The player drives Krishna's chariot, with Arjuna aboard, across Kurukshetra: the game
// casts Rahmat Wibowo as Krishna and the Pandawa (the page's posters cast Rahmat Wibowo as Krishna). Each chapter's dated
// records are written down and brought to Sanjaya's tower; no one is ever struck. After each chapter the Tercatat screen
// shows what went on record; then Sanjaya reports, under the allegation line, who the dossier alleges acted in that
// period. Names, event titles and dossier facts appear only on those still screens, never during play: the HUD and its
// toasts carry counts, dates, channels and timers. The flow is a pure reducer (lib/bowobharata-game/flow.ts) and the
// screens are presentational (bowobharata-game/screens.tsx). This file loads the scene with the runtime that drives it
// (lib/bowobharata-game/world/runtime.ts), reads the keyboard, and turns the runtime's HUD snapshots and events into the
// HUD, the toasts, the lakon card with its letterbox, and the end of each play.
import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Locale } from '../i18n';
import { PARVAS } from '../lib/bowobharata';
import type { KurukshetraScene } from '../lib/bowobharata/KurukshetraScene';
import { GAME_DATA_SRC, type GameData } from '../lib/bowobharata-game/data';
import { speedOf } from '../lib/bowobharata-game/drive';
import type { FrameInput, GameState } from '../lib/bowobharata-game/engine';
import { initFlow, readSaved, reduce, writeSaved, type Screen, type Settings } from '../lib/bowobharata-game/flow';
import { failShotDone, sameHud, type HudSnapshot } from '../lib/bowobharata-game/hud';
import { keyAction, keyboardInput } from '../lib/bowobharata-game/input';
import type { FailReason, GameEvent } from '../lib/bowobharata-game/mission-run';
import { DRIVE, MISSION_TIMING } from '../lib/bowobharata-game/tuning';
import type { Runtime } from '../lib/bowobharata-game/world/runtime';
import {
  DataError, FailCard, FallbackPlay, Finale, GameHud, Gate, type GatePosters, type HudToast, Intro, MissionCard, Paused, Recorded,
  SanjayaReport, SlowPrompt, toastText,
} from './bowobharata-game/screens';
import '../styles/bowobharata-game.css';

interface Props { locale: Locale; forceFallback?: boolean; data?: GameData; posters?: GatePosters }

const COUNT = PARVAS.length + 2;
/** The screens on which the scene stands still; it also stands still while the game is paused. */
const STILL_SCREENS: readonly Screen[] = ['recorded', 'sanjaya', 'lost'];
/** The lakon events that show a toast; toastText gives each its line. */
const TOASTED: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>(['recorded', 'filed', 'rewriteTaken', 'held', 'checkpoint', 'wall']);
/** Toasts on screen at once, and how long each stays (ms). */
const TOAST_MAX = 2;
const TOAST_MS = 4000;

const storage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

/**
 * Development only, for the slice check in the browser: input that stands in for the keyboard while set, through
 * window.__bowo.setInputOverride. A production build sets import.meta.env.DEV to false and drops every use of it.
 */
type DevInput = (s: GameState) => Omit<FrameInput, 'aspect'>;
let devInput: DevInput | null = null;

/** Whether a key went to a text field of the page, which the game leaves alone. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
}

export default function BowobharataGame({ locale, forceFallback, data: given, posters }: Props) {
  const [flow, dispatch] = useReducer(reduce, undefined, () => initFlow(COUNT, { fallback: !!forceFallback }));
  const [data, setData] = useState<GameData | null>(given ?? null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(0);
  const [taken, setTaken] = useState(0);
  // The pause panel's toggles, for this session only: never written to storage.
  const [settings, setSettings] = useState<Settings>({ assist: false, easy: false });
  const [failReason, setFailReason] = useState<FailReason>('time');
  // False after the skip that follows two fails: Tercatat then says the rest was filled in.
  const [whole, setWhole] = useState(true);
  // The play view: the latest HUD snapshot, the toasts, the lakon card, the letterbox and the gunungan wipe.
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const [mission, setMission] = useState(false);
  const [cine, setCine] = useState(false);
  const [wipe, setWipe] = useState<'a' | 'b' | null>(null);
  // The device stayed slow at the lowest pixel ratio: the version without animation is offered.
  const [slow, setSlow] = useState(false);
  const [device, setDevice] = useState({ touch: false, canFullscreen: false });
  const [fullscreen, setFullscreen] = useState(false);

  const gameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KurukshetraScene | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  // The latest flow, data and settings, for the runtime's callbacks and the key listeners.
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const dataRef = useRef(data);
  dataRef.current = data;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // The keyboard: the codes held, the last steer, when the input was last read (ms), and a skip waiting for its frame.
  const keys = useRef(new Set<string>());
  const steer = useRef(0);
  const readAt = useRef(0);
  const skipPulse = useRef(false);
  // The play view's clockwork: its pending timers (toasts), the toast ids, whether
  // the lakon card is up, and whether the next HUD snapshot is the chapter's first.
  const timers = useRef(new Set<number>());
  const toastId = useRef(0);
  const missionUp = useRef(false);
  const first = useRef(false);
  // The game clock at the failed event, until the fail shot has run; and the chapter the stage was last scrolled for.
  const failClock = useRef<number | null>(null);
  const scrolledFor = useRef(-1);
  // The last screen each runtime was given its command for (see the command effect), and the plays started so far.
  const issued = useRef<{ rt: Runtime | null; screen: Screen | null; chapter: number }>({ rt: null, screen: null, chapter: -1 });
  const plays = useRef(0);

  const playing3d = flow.screen === 'play' && flow.mode === '3d';

  /** Runs `fn` after `ms`, unless the play view is reset first. */
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const pushToast = (text: string) => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, text }].slice(-TOAST_MAX));
    later(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
  };

  /** The lakon card and the letterbox, opened by the gunungan: one CSS animation covers the stage, then opens it. */
  const showMission = () => {
    if (missionUp.current) return;
    missionUp.current = true;
    setMission(true);
    setCine(true);
    setWipe((w) => (w === 'a' ? 'b' : 'a')); // alternating names restart the animation on every transition
  };

  const hideMission = () => {
    missionUp.current = false;
    setMission(false);
    setCine(false);
    setWipe(null);
  };

  /** Clears the play view: its timers, the HUD, the toasts, the card, the letterbox and any skip not yet taken. */
  const resetPlay = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    missionUp.current = false;
    first.current = false;
    failClock.current = null;
    skipPulse.current = false;
    setHud(null);
    setToasts((list) => (list.length > 0 ? [] : list));
    setMission(false);
    setCine(false);
    setWipe(null);
  };

  /** Whether a skip may be asked for: the lakon card is up and its intro has run MISSION_TIMING.introSkipAfter. */
  const canSkip = () => {
    const run = runtimeRef.current?.state()?.run;
    return missionUp.current && run?.phase === 'intro' && run.phaseT >= MISSION_TIMING.introSkipAfter;
  };

  /** A record's date and channel for its toast, from the chapter's event cards. */
  const cardOf = (card: number) => {
    const e = dataRef.current?.events[flowRef.current.chapter]?.[card];
    return e ? { date: e.dateLabel[locale], channel: e.channel[locale] } : null;
  };

  const onHud = (h: HudSnapshot) => {
    if (flowRef.current.screen !== 'play') return;
    setHud((prev) => (prev && sameHud(prev, h) ? prev : h));
    // The fail shot is timed on the game clock, which the scene's pause stops.
    const clock = runtimeRef.current?.state()?.clock;
    if (failClock.current !== null && clock !== undefined && failShotDone(clock, failClock.current, MISSION_TIMING.failSeconds)) {
      failClock.current = null;
      dispatch({ type: 'playResult', result: 'lost', score: 0 });
      return;
    }
    if (first.current) {
      first.current = false;
      if (h.phase === 'intro') showMission(); // the prologue begins in its intro, so no introStart comes for it
    }
  };

  const onEvents = (events: readonly GameEvent[]) => {
    // Only a play shows its events: the fail card's skip records the rest while Tercatat is on its way.
    if (flowRef.current.screen !== 'play') return;
    for (const e of events) {
      switch (e.type) {
        case 'introStart':
          showMission();
          break;
        case 'introEnd':
          hideMission();
          break;
        case 'outroStart':
          setCine(true);
          break;
        case 'done':
          dispatch({ type: 'playResult', result: 'won', score: e.score });
          break;
        case 'failed':
          // The fail shot plays first; the soft-fail card follows it.
          setFailReason(e.reason);
          failClock.current = runtimeRef.current?.state()?.clock ?? null;
          break;
        default:
          if (TOASTED.has(e.type)) {
            const text = toastText(e, locale, flowRef.current.chapter, cardOf);
            if (text) pushToast(text);
          }
      }
    }
  };

  /** The frame's input: the held keys (the steer ramped on real time), a skip once, and the session's settings. */
  const readInput = (): Omit<FrameInput, 'aspect'> => {
    if (import.meta.env.DEV) {
      const s = devInput ? runtimeRef.current?.state() : null;
      if (devInput && s) return devInput(s);
    }
    const now = performance.now();
    const dt = readAt.current > 0 ? Math.min(DRIVE.maxDt, Math.max(0, (now - readAt.current) / 1000)) : 1 / 60;
    readAt.current = now;
    const car = runtimeRef.current?.state()?.car;
    const s = settingsRef.current;
    const kb = keyboardInput(keys.current, steer.current, dt, { on: s.easy, speed: car ? speedOf(car) : 0 });
    steer.current = kb.drive.steer;
    const skip = skipPulse.current;
    skipPulse.current = false;
    return { drive: kb.drive, sight: kb.sight, skip, assist: s.assist };
  };

  // The runtime holds these for its whole life; through this ref it always calls the ones of the latest render.
  const handlers = useRef({ onHud, onEvents, readInput });
  handlers.current = { onHud, onEvents, readInput };

  // Mount: fallback triggers, saved progress, the dossier data.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const asked = new URLSearchParams(window.location.search).get('fallback') === '1';
    if (reduced || asked) dispatch({ type: 'contextLost' });
    const saved = readSaved(storage());
    if (saved) dispatch({ type: 'restore', chapter: saved.chapter, best: saved.best });
    if (!given) {
      let live = true;
      setLoadError(false);
      fetch(GAME_DATA_SRC).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!live) return;
        if (d) setData(d as GameData); else setLoadError(true);
      }).catch(() => { if (live) setLoadError(true); });
      return () => { live = false; };
    }
  }, [given, attempt]);

  useEffect(() => {
    if (flow.screen !== 'gate') writeSaved(storage(), { best: flow.best, chapter: flow.chapter });
  }, [flow.screen, flow.chapter, flow.best]);

  // Development only, for the slice check in the browser: window.__bowo reads the runtime (null before the scene) and
  // sets or clears the input that stands in for the keyboard. A production build drops it.
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as Window & { __bowo?: { runtime(): Runtime | null; setInputOverride(fn: DevInput | null): void } };
      w.__bowo = { runtime: () => runtimeRef.current, setInputOverride: (fn) => { devInput = fn; } };
      return () => {
        delete w.__bowo;
        devInput = null;
      };
    }
    return undefined;
  }, []);

  // The device: a coarse pointer words the hints for touch and leaves the rings to the touch buttons; full screen only
  // where the browser allows it.
  useEffect(() => {
    setDevice({ touch: window.matchMedia('(pointer: coarse)').matches, canFullscreen: document.fullscreenEnabled === true });
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // The keyboard, on window and by e.code. The page's text fields keep their keys, and so does any key with Ctrl, Alt or
  // Cmd. While a 3D play runs, Esc or P pauses and resumes, and once its chapter has started the game's keys drive (their
  // default action is suppressed, so arrows do not scroll and Space does not press a focused button); while paused, and
  // while a play still waits for its data, the keys are the page's, so the data error's Retry takes Enter and Space. A
  // lost focus or a hidden tab lets go of every held key.
  useEffect(() => {
    const driving = () => {
      const f = flowRef.current;
      const rt = runtimeRef.current;
      // The command effect marks a play as issued only once it has started (or retried) the chapter on this runtime.
      return f.screen === 'play' && f.mode === '3d' && !f.paused && rt !== null && issued.current.rt === rt && issued.current.screen === 'play';
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const action = keyAction(e.code);
      const f = flowRef.current;
      if (action === null || f.screen !== 'play' || f.mode !== '3d') return;
      if (action === 'pause') {
        e.preventDefault();
        if (!e.repeat) dispatch({ type: 'togglePause' });
        return;
      }
      if (!driving()) return;
      e.preventDefault();
      keys.current.add(e.code);
      if (action === 'skip' && !e.repeat && canSkip()) skipPulse.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      if (!typing(e.target) && keyAction(e.code) !== null && driving()) e.preventDefault();
    };
    const release = () => keys.current.clear();
    const onVisibility = () => {
      release();
      dispatch({ type: document.hidden ? 'hidden' : 'visible' });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // The 3D scene and its runtime live from the first intro until the fallback takes over or the island unmounts.
  const wants3d = flow.mode === '3d' && flow.screen !== 'gate';
  useEffect(() => {
    if (!wants3d) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: KurukshetraScene | undefined;
    let runtime: Runtime | undefined;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    };
    // The canvas also changes size in and out of full screen, which a window resize does not always report.
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    (async () => {
      try {
        const [{ createScene }, { createRuntime }] = await Promise.all([
          import('../lib/bowobharata/KurukshetraScene'),
          import('../lib/bowobharata-game/world/runtime'),
        ]);
        if (disposed) return;
        const mobile = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
        scene = createScene({ canvas, reducedMotion: false, mobile, onLost: () => dispatch({ type: 'contextLost' }), game: true });
        runtime = createRuntime(scene, {
          mobile,
          aspect: () => {
            const r = canvas.getBoundingClientRect();
            return r.width / r.height;
          },
          readInput: () => handlers.current.readInput(),
          onHud: (h) => handlers.current.onHud(h),
          onEvents: (e) => handlers.current.onEvents(e),
          onError: () => dispatch({ type: 'contextLost' }),
          onSlow: () => setSlow(true),
        });
        sceneRef.current = scene;
        runtimeRef.current = runtime;
        fit();
        if (sizes) sizes.observe(canvas);
        else window.addEventListener('resize', fit);
        setReady((n) => n + 1);
      } catch {
        if (!disposed) dispatch({ type: 'contextLost' });
      }
    })();
    return () => {
      disposed = true;
      sizes?.disconnect();
      window.removeEventListener('resize', fit);
      runtime?.dispose();
      scene?.dispose();
      sceneRef.current = null;
      runtimeRef.current = null;
      issued.current = { rt: null, screen: null, chapter: -1 };
      keys.current.clear();
      setSlow(false);
      setReady(0);
    };
  }, [wants3d]);

  useEffect(() => {
    sceneRef.current?.setPaused(flow.paused || STILL_SCREENS.includes(flow.screen));
  }, [flow.paused, flow.screen, ready]);

  // The runtime follows the screens: it circles the chariot behind a chapter's intro card, plays the chapter (afresh,
  // or from its checkpoint after a fail) and circles the tower in the finale. Each command goes once per screen and
  // runtime, so a new runtime gets the current one, and data that arrives late starts the play that waited for it.
  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt || flow.mode !== '3d') return;
    const last = issued.current;
    if (last.rt === rt && last.screen === flow.screen && last.chapter === flow.chapter) return;
    if (flow.screen === 'play' && !data) return;
    issued.current = { rt, screen: flow.screen, chapter: flow.chapter };
    try {
      if (flow.screen === 'intro') rt.orbit();
      else if (flow.screen === 'finale') rt.finale();
      else if (flow.screen === 'play' && data) {
        resetPlay();
        first.current = true;
        steer.current = 0;
        const seed = 1009 * (flow.chapter + 1) + plays.current++;
        const fromLost = last.rt === rt && last.screen === 'lost';
        if (fromLost) rt.retry();
        else rt.start(flow.chapter, (data.events[flow.chapter] ?? []).map((e) => e.slug), seed);
      }
    } catch (err) {
      // The data and the lakon table disagree (a chapter's slugs): the version without animation still tells it.
      console.error('BOWOBHARATA: the runtime could not take the chapter.', err);
      dispatch({ type: 'contextLost' });
    }
  }, [flow.screen, flow.chapter, flow.mode, ready, data]);

  // Out of play the play view is cleared, so nothing from one play (a toast, the letterbox, a pending loss) reaches the
  // next screen; the same on unmount.
  useEffect(() => {
    if (!playing3d) resetPlay();
  }, [playing3d]);
  useEffect(() => () => {
    for (const t of timers.current) window.clearTimeout(t);
  }, []);

  // The site header's height, measured on mount and on resize, for the stage's height and scroll margin (the CSS falls
  // back to 59 px).
  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('.nav');
      const h = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
      if (h > 0) gameRef.current?.style.setProperty('--nav-h', `${h}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // When a chapter's play starts, the stage scrolls to sit just under the sticky header; not again within the chapter.
  useEffect(() => {
    if (!playing3d) return;
    if (scrolledFor.current === flow.chapter) return;
    scrolledFor.current = flow.chapter;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stageRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }, [playing3d, flow.chapter]);
  useEffect(() => {
    if (flow.screen === 'gate' || flow.screen === 'intro') scrolledFor.current = -1;
  }, [flow.screen]);

  // Fallback play starts from the first event each time a chapter's play begins.
  useEffect(() => { setTaken(0); }, [flow.screen, flow.chapter, flow.mode]);
  // Every play makes the record whole again; only the skip from the fail card leaves part of it filled in.
  useEffect(() => { if (flow.screen === 'play') setWhole(true); }, [flow.screen]);

  // Offered on the screens that leave the top of the stage clear: play, and a chapter's intro in its corner.
  const slowShown = slow && flow.mode === '3d' && (flow.screen === 'play' || flow.screen === 'intro');

  // Full screen holds the stage alone, and the still screens and the slow-device offer sit outside it: it ends with the
  // play, or when the offer comes.
  useEffect(() => {
    if (playing3d && !slowShown) return;
    const stage = stageRef.current;
    if (stage && document.fullscreenElement === stage) Promise.resolve(document.exitFullscreen()).catch(() => {});
  }, [playing3d, slowShown]);

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage || !document.fullscreenEnabled) return;
    // A refusal (no user gesture, or a browser that will not) leaves the stage as it is.
    const change = document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen();
    Promise.resolve(change).catch(() => {});
  };

  // A press on the stage skips the lakon intro while its card is up; a press on a button or a link is not a skip.
  const onStagePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flowRef.current.paused || (e.target as Element).closest('button, a')) return;
    if (canSkip()) skipPulse.current = true;
  };

  const next = () => dispatch({ type: 'next' });
  const chapter = data?.chapters[flow.chapter];
  const cards = data?.events[flow.chapter] ?? [];
  const show3d = flow.mode === '3d' && flow.screen !== 'gate';

  return (
    <div ref={gameRef} className="bg-game" data-mode={flow.mode} data-screen={flow.screen}>
      {show3d && (
        <div
          ref={stageRef}
          className="bg-stage"
          data-play={playing3d ? 'on' : undefined}
          data-paused={flow.paused ? 'on' : undefined}
          data-cine={playing3d && cine ? 'on' : undefined}
          data-wipe={playing3d && cine && wipe ? wipe : undefined}
          onPointerDown={onStagePointerDown}
        >
          <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />
          <div className="bg-wipe" aria-hidden="true" />
          {playing3d && hud && (
            <GameHud
              locale={locale}
              hud={hud}
              touch={device.touch}
              paused={flow.paused}
              toasts={toasts}
              onPause={() => dispatch({ type: 'togglePause' })}
              onFullscreen={toggleFullscreen}
              canFullscreen={device.canFullscreen}
              fullscreen={fullscreen}
            />
          )}
          {playing3d && mission && hud && <MissionCard locale={locale} chapterIndex={flow.chapter} type={hud.type} />}
          {playing3d && flow.paused && (
            <Paused
              locale={locale}
              onResume={() => dispatch({ type: 'togglePause' })}
              settings={settings}
              onSettings={setSettings}
              onUseStill={() => dispatch({ type: 'useFallback' })}
            />
          )}
        </div>
      )}

      {slowShown && <SlowPrompt locale={locale} onUseStill={() => dispatch({ type: 'useFallback' })} onKeepPlaying={() => setSlow(false)} />}
      {loadError && !data && flow.screen !== 'gate' && flow.screen !== 'intro' && <DataError locale={locale} onRetry={() => setAttempt((n) => n + 1)} />}
      {flow.screen === 'gate' && <Gate locale={locale} fallback={flow.mode === 'fallback'} onStart={() => dispatch({ type: 'start' })} posters={posters} />}
      {flow.screen === 'intro' && <Intro locale={locale} chapterIndex={flow.chapter} onNext={next} layout={show3d ? 'corner' : undefined} />}
      {flow.screen === 'play' && flow.mode === 'fallback' && data && (
        <FallbackPlay
          locale={locale}
          chapterIndex={flow.chapter}
          cards={cards}
          prologue={data.prologue}
          taken={taken}
          onTake={() => setTaken((n) => n + 1)}
          onDone={() => dispatch({ type: 'playResult', result: 'won', score: 0 })}
        />
      )}
      {flow.screen === 'recorded' && data && (
        <Recorded locale={locale} chapterIndex={flow.chapter} cards={cards} prologue={data.prologue} whole={whole} onNext={next} />
      )}
      {flow.screen === 'sanjaya' && chapter && <SanjayaReport locale={locale} chapterIndex={flow.chapter} chapter={chapter} onNext={next} />}
      {flow.screen === 'lost' && (
        <FailCard
          locale={locale}
          reason={failReason}
          fails={flow.fails}
          assist={settings.assist}
          onRetry={() => dispatch({ type: 'retry' })}
          onSkip={() => { failClock.current = null; setWhole(false); runtimeRef.current?.skip(); dispatch({ type: 'skip' }); }}
        />
      )}
      {flow.screen === 'finale' && data && <Finale locale={locale} totals={data.totals} onAgain={() => { writeSaved(storage(), { best: flow.best, chapter: 0 }); dispatch({ type: 'restart' }); }} />}
    </div>
  );
}

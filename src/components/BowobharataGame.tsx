// BOWOBHARATA, the game island. The player rides as Rahmat Wibowo; the campaign's arrows come at him and he only catches
// them, so they go on record. After each chapter Sanjaya reports, under the allegation line, who the dossier alleges acted
// in that period. The flow is a pure reducer (lib/bowobharata-game/flow.ts); the screens are presentational
// (bowobharata-game/screens.tsx); this file wires them to the 3D scene, the arrow layer and the input.
import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Locale } from '../i18n';
import { PARVAS, parvaEvents } from '../lib/bowobharata';
import { PARVA_POSES } from '../lib/bowobharata/stage-math';
import type { KurukshetraScene } from '../lib/bowobharata/KurukshetraScene';
import type { ArrowLayer } from '../lib/bowobharata-game/arrows3d';
import { GAME_COPY } from '../lib/bowobharata-game/copy';
import { GAME_DATA_SRC, type GameData } from '../lib/bowobharata-game/data';
import { initFlow, readSaved, reduce, writeSaved } from '../lib/bowobharata-game/flow';
import { pickNearest } from '../lib/bowobharata-game/pick';
import { buildWave, catchArrow, startRun, step, type Run } from '../lib/bowobharata-game/rules';
import { CatchCard, FallbackPlay, Finale, Gate, type GatePosters, Hud, Intro, Lost, Paused, SanjayaReport, catchItems, type CatchItem } from './bowobharata-game/screens';
import '../styles/bowobharata-game.css';

interface Props { locale: Locale; forceFallback?: boolean; data?: GameData; posters?: GatePosters }

const COUNT = PARVAS.length + 2;
const PICK_RADIUS = 28;
const LONG_PRESS_MS = 350;
const RETICLE_STEP = 24;
const MIN_PROLOGUE_ARROWS = 6;
const MAX_PROLOGUE_ARROWS = 12;
const EMPTY_RUN = startRun({ arrows: [] });

const storage = (): Storage | undefined => {
  try { return window.localStorage; } catch { return undefined; }
};

interface HudState { caught: number; missed: number; decoys: number }
const hudOf = (r: Run): HudState => ({ caught: r.caught.length, missed: r.misses, decoys: r.decoysTaken });

export default function BowobharataGame({ locale, forceFallback, data: given, posters }: Props) {
  const copy = GAME_COPY[locale];
  const [flow, dispatch] = useReducer(reduce, undefined, () => initFlow(COUNT, { fallback: !!forceFallback }));
  const [data, setData] = useState<GameData | null>(given ?? null);
  const [ready, setReady] = useState(0);
  const [hud, setHud] = useState<HudState>({ caught: 0, missed: 0, decoys: 0 });
  const [sight, setSightState] = useState(false);
  const [card, setCard] = useState<CatchItem | null>(null);
  const [taken, setTaken] = useState(0);
  const [reticle, setReticle] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KurukshetraScene | null>(null);
  const layerRef = useRef<ArrowLayer | null>(null);
  const runRef = useRef<Run | null>(null);
  const sightRef = useRef(false);
  const pausedRef = useRef(false);
  const attemptRef = useRef(0);
  const revealRef = useRef<CatchItem[]>([]);
  const nextRevealRef = useRef(0);
  const reticleRef = useRef<{ x: number; y: number } | null>(null);

  pausedRef.current = flow.paused;
  const setSight = useCallback((on: boolean) => { sightRef.current = on; setSightState(on); }, []);

  // Mount: fallback triggers, saved progress, the dossier data.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const asked = new URLSearchParams(window.location.search).get('fallback') === '1';
    if (reduced || asked) dispatch({ type: 'contextLost' });
    const saved = readSaved(storage());
    if (saved) dispatch({ type: 'restore', chapter: saved.chapter, best: saved.best });
    if (!given) {
      let live = true;
      fetch(GAME_DATA_SRC).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setData(d as GameData); }).catch(() => {});
      return () => { live = false; };
    }
  }, [given]);

  useEffect(() => {
    if (flow.screen !== 'gate') writeSaved(storage(), { best: flow.best, chapter: flow.chapter });
  }, [flow.screen, flow.chapter, flow.best]);

  useEffect(() => {
    const onVis = () => dispatch({ type: document.hidden ? 'hidden' : 'visible' });
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // The 3D scene lives from the first intro until the fallback takes over or the island unmounts.
  const wants3d = flow.mode === '3d' && flow.screen !== 'gate';
  useEffect(() => {
    if (!wants3d) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: KurukshetraScene | undefined;
    let layer: ArrowLayer | undefined;
    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      scene?.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    };
    (async () => {
      try {
        const [{ createScene }, { createArrowLayer }] = await Promise.all([
          import('../lib/bowobharata/KurukshetraScene'),
          import('../lib/bowobharata-game/arrows3d'),
        ]);
        if (disposed) return;
        const mobile = window.matchMedia('(max-width: 700px)').matches;
        scene = createScene({ canvas, reducedMotion: false, mobile, onLost: () => dispatch({ type: 'contextLost' }), game: true });
        if (!scene.game) throw new Error('scene has no game API');
        layer = createArrowLayer(scene.game, { sight: () => sightRef.current });
        sceneRef.current = scene;
        layerRef.current = layer;
        onResize();
        window.addEventListener('resize', onResize);
        setReady((n) => n + 1);
      } catch {
        if (!disposed) dispatch({ type: 'contextLost' });
      }
    })();
    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      layer?.dispose();
      scene?.dispose();
      sceneRef.current = null;
      layerRef.current = null;
      setReady(0);
    };
  }, [wants3d]);

  useEffect(() => {
    sceneRef.current?.setPaused(flow.paused);
  }, [flow.paused, ready]);

  // One play of the current chapter in 3D: a fresh wave, the chapter's camera, and a per-frame step.
  const playing3d = flow.screen === 'play' && flow.mode === '3d' && ready > 0 && data !== null;
  useEffect(() => {
    if (!playing3d || !data) return;
    const scene = sceneRef.current;
    const layer = layerRef.current;
    const game = scene?.game;
    if (!game || !layer) return;
    const i = flow.chapter;
    revealRef.current = catchItems(i, data.chapters, locale);
    nextRevealRef.current = 0;
    const seed = 1009 * (i + 1) + attemptRef.current++;
    const wave = i === 0
      ? buildWave(0, [], seed, Math.min(MAX_PROLOGUE_ARROWS, Math.max(MIN_PROLOGUE_ARROWS, revealRef.current.length)))
      : buildWave(i, parvaEvents(PARVAS[i - 1]).map((e) => e.slug), seed);
    let run = startRun(wave);
    runRef.current = run;
    setHud(hudOf(run));
    setCard(null);
    setSight(false);
    game.setPose(PARVA_POSES[Math.min(i, PARVA_POSES.length - 1)]);
    let finished = false;
    const off = game.onFrame((_t, dt) => {
      if (pausedRef.current || finished || !runRef.current) return;
      run = step({ ...runRef.current, sight: sightRef.current }, dt);
      runRef.current = run;
      layer.sync(run);
      setHud((h) => {
        const n = hudOf(run);
        return h.caught === n.caught && h.missed === n.missed && h.decoys === n.decoys ? h : n;
      });
      if (run.result !== 'playing') {
        finished = true;
        dispatch({ type: 'playResult', result: run.result, score: run.score });
      }
    });
    return () => {
      off();
      runRef.current = null;
      // The scene's own cleanup may already have disposed the layer (fallback or unmount); only clear a live one.
      if (layerRef.current === layer) layer.sync(EMPTY_RUN);
      setSight(false);
    };
  }, [playing3d, ready, flow.chapter, flow.screen, data, locale, setSight]);

  // Fallback play starts from the first event each time a chapter's play begins.
  useEffect(() => { setTaken(0); }, [flow.screen, flow.chapter, flow.mode]);

  const catchAt = useCallback((x: number, y: number) => {
    const run = runRef.current;
    const layer = layerRef.current;
    const canvas = canvasRef.current;
    if (!run || !layer || !canvas || pausedRef.current) return;
    const r = canvas.getBoundingClientRect();
    const id = pickNearest(layer.screenPoints(r.width, r.height), { x, y }, PICK_RADIUS);
    if (id === null) return;
    const next = catchArrow(run, id);
    if (next === run) return;
    runRef.current = next;
    setHud(hudOf(next));
    const arrow = next.wave.arrows.find((a) => a.id === id);
    if (arrow?.kind === 'real') {
      const item = arrow.eventSlug
        ? revealRef.current.find((it) => it.kind === 'event' && it.event.idSlug === arrow.eventSlug)
        : revealRef.current[nextRevealRef.current++ % Math.max(1, revealRef.current.length)];
      if (item) setCard(item);
    }
  }, []);

  const moveReticle = useCallback((x: number, y: number) => {
    reticleRef.current = { x, y };
    setReticle({ x, y });
  }, []);

  // Keyboard: arrows move the reticle, Space catches under it, K held is Krishna's sight, Esc or P pauses.
  useEffect(() => {
    if (flow.screen !== 'play' || flow.mode !== '3d') return;
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key === 'escape' || key === 'p') { e.preventDefault(); dispatch({ type: 'togglePause' }); return; }
      if (pausedRef.current) return;
      if (key === 'k') { if (!e.repeat) setSight(true); return; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const cur = reticleRef.current ?? { x: r.width / 2, y: r.height / 2 };
      const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
      const moves: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (moves[key]) {
        e.preventDefault();
        const [dx, dy] = moves[key];
        moveReticle(clamp(cur.x + dx * RETICLE_STEP, r.width), clamp(cur.y + dy * RETICLE_STEP, r.height));
      } else if (key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!reticleRef.current) moveReticle(cur.x, cur.y);
        catchAt(cur.x, cur.y);
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k') setSight(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [flow.screen, flow.mode, catchAt, moveReticle, setSight]);

  // Pointer: a mouse click catches at once; a touch catches on release, unless held long enough to be Krishna's sight.
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);
  const local = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    if (e.pointerType === 'mouse') { if (e.button === 0) catchAt(p.x, p.y); return; }
    const state = { timer: 0, long: false };
    state.timer = window.setTimeout(() => { state.long = true; setSight(true); }, LONG_PRESS_MS);
    press.current = state;
  };
  const endPress = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = press.current;
    press.current = null;
    if (!state) return;
    window.clearTimeout(state.timer);
    if (state.long) setSight(false);
    else if (!cancelled) { const p = local(e); catchAt(p.x, p.y); }
  };

  const next = () => dispatch({ type: 'next' });
  const chapter = data?.chapters[flow.chapter];
  const items = data ? catchItems(flow.chapter, data.chapters, locale) : [];
  const show3d = flow.mode === '3d' && flow.screen !== 'gate';

  return (
    <div className="bg-game" data-mode={flow.mode} data-screen={flow.screen}>
      {show3d && (
        <div className="bg-stage">
          <canvas ref={canvasRef} className="bg-canvas" aria-hidden="true" />
          {flow.screen === 'play' && (
            <div
              className="bg-surface"
              role="application"
              aria-label={`${copy.title}. ${copy.controls.join(' ')}`}
              onPointerDown={onPointerDown}
              onPointerUp={(e) => endPress(e, false)}
              onPointerCancel={(e) => endPress(e, true)}
              onPointerLeave={(e) => endPress(e, true)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {reticle && <span className="bg-reticle" aria-hidden="true" style={{ left: reticle.x, top: reticle.y }} />}
            </div>
          )}
        </div>
      )}

      {flow.screen === 'gate' && <Gate locale={locale} fallback={flow.mode === 'fallback'} onStart={() => dispatch({ type: 'start' })} posters={posters} />}
      {flow.screen === 'intro' && <Intro locale={locale} chapterIndex={flow.chapter} onNext={next} />}
      {flow.screen === 'play' && flow.mode === '3d' && (
        <>
          <Hud locale={locale} {...hud} sight={sight} paused={flow.paused} onPause={() => dispatch({ type: 'togglePause' })} />
          <div className="bg-cards" aria-live="polite">{card && <CatchCard locale={locale} item={card} />}</div>
          {flow.paused && <Paused locale={locale} onResume={() => dispatch({ type: 'togglePause' })} />}
        </>
      )}
      {flow.screen === 'play' && flow.mode === 'fallback' && data && (
        <FallbackPlay
          locale={locale}
          items={items}
          taken={taken}
          onTake={() => setTaken((n) => n + 1)}
          onDone={() => dispatch({ type: 'playResult', result: 'won', score: 0 })}
        />
      )}
      {flow.screen === 'sanjaya' && chapter && <SanjayaReport locale={locale} chapterIndex={flow.chapter} chapter={chapter} onNext={next} />}
      {flow.screen === 'lost' && <Lost locale={locale} onRetry={() => dispatch({ type: 'retry' })} />}
      {flow.screen === 'finale' && data && <Finale locale={locale} totals={data.totals} onAgain={() => { writeSaved(storage(), { best: flow.best, chapter: 0 }); dispatch({ type: 'restart' }); }} />}
    </div>
  );
}

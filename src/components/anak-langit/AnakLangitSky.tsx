import { useEffect, useRef, useState } from 'react';
import { ASTERISMS, PLANETS, STARS, type SkyState } from '../../lib/anak-langit/sky-data';
import type { SkySceneHandle } from '../../lib/anak-langit/SkyScene';

// Ported from infraloka/src/app/story/anak-langit/{SkyStage,SkyFallback}.tsx.

const C = 300;
const R = 262;
const project = (alt: number, az: number): [number, number] => {
  const r = (R * (90 - alt)) / 90;
  const a = (az * Math.PI) / 180;
  return [C - r * Math.sin(a), C - r * Math.cos(a)];
};

/** Static zenith-up sky map, shown while three.js loads or when WebGL is unavailable. Purely decorative. */
function SkyFallback() {
  const byName = new Map(STARS.map((s) => [s.name, s]));
  const mars = PLANETS.find((p) => p.name === 'Mars')!;
  const [mx, my] = project(mars.alt, mars.az);
  return (
    <svg className="al-fallback" viewBox="0 0 600 600" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="al-dusk" cx="100%" cy="55%" r="75%">
          <stop offset="0" stopColor="#f0a36b" stopOpacity=".42" />
          <stop offset=".35" stopColor="#6a4a86" stopOpacity=".22" />
          <stop offset="1" stopColor="#0a0f2a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="#0b1130" />
      <circle cx={C} cy={C} r={R} fill="url(#al-dusk)" />
      <circle cx={C} cy={C} r={R} fill="none" stroke="#39437a" strokeWidth="1.2" />
      {ASTERISMS.map(([a, b]) => {
        const sa = byName.get(a);
        const sb = byName.get(b);
        if (!sa || !sb) return null;
        const [x1, y1] = project(sa.alt, sa.az);
        const [x2, y2] = project(sb.alt, sb.az);
        return <line key={a + b} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7fd3c8" strokeOpacity=".45" />;
      })}
      {STARS.map((s) => {
        const [x, y] = project(s.alt, s.az);
        return <circle key={s.name} cx={x} cy={y} r={Math.max(1.1, 3.6 - s.mag * 0.75)} fill="#ece8f6" fillOpacity=".85" />;
      })}
      <circle cx={mx} cy={my} r="16" fill="#ff7b5e" fillOpacity=".12" />
      <circle cx={mx} cy={my} r="9" fill="#ff7b5e" fillOpacity=".22" />
      <circle cx={mx} cy={my} r="5" fill="#ff7b5e" />
    </svg>
  );
}

export default function AnakLangitSky({ state }: { state: SkyState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SkySceneHandle | null>(null);
  const stateRef = useRef(state);
  const [mode, setMode] = useState<'loading' | 'webgl' | 'failed'>('loading');

  useEffect(() => {
    stateRef.current = state;
    handleRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let io: IntersectionObserver | undefined;
    let ro: ResizeObserver | undefined;
    let onVisibility: (() => void) | undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowPower = window.matchMedia('(max-width: 768px)').matches;

    const load = () =>
      import('../../lib/anak-langit/SkyScene')
        .then(({ createSkyScene }) => {
          if (cancelled) return;
          const handle = createSkyScene(canvas, { reducedMotion, lowPower });
          handleRef.current = handle;
          handle.setState(stateRef.current);
          setMode('webgl');

          const parent = canvas.parentElement!;
          const rect = parent.getBoundingClientRect();
          handle.resize(rect.width, rect.height);
          ro = new ResizeObserver(([entry]) => handle.resize(entry.contentRect.width, entry.contentRect.height));
          ro.observe(parent);

          let onScreen = true;
          const sync = () => handle.setPaused(!onScreen || document.hidden);
          io = new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            sync();
          });
          io.observe(canvas);
          onVisibility = sync;
          document.addEventListener('visibilitychange', onVisibility);
        })
        .catch(() => {
          if (!cancelled) setMode('failed');
        });

    // Fetch three.js only when the chapter is within a viewport of the screen.
    const gate = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        gate.disconnect();
        load();
      },
      { rootMargin: '100% 0px' },
    );
    gate.observe(canvas);

    return () => {
      cancelled = true;
      gate.disconnect();
      io?.disconnect();
      ro?.disconnect();
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  return (
    <>
      {mode !== 'webgl' && <SkyFallback />}
      <canvas ref={canvasRef} className={mode === 'webgl' ? 'al-canvas' : 'al-canvas al-canvas--hidden'} aria-hidden="true" />
    </>
  );
}

import { TUNING } from './tuning';

/** Lanes are integers in [-LANE_RANGE, LANE_RANGE]; the 3D layer maps them to positions. */
export const LANE_RANGE = 2;

export interface Arrow {
  id: number;
  kind: 'real' | 'decoy';
  eventSlug: string | null;
  launch: number;
  flight: number;
  lane: number;
  state: 'flying' | 'caught' | 'missed' | 'passed';
}

export interface Wave {
  arrows: Arrow[];
}

export interface Run {
  t: number;
  wave: Wave;
  caught: number[];
  misses: number;
  decoysTaken: number;
  score: number;
  sight: boolean;
  result: 'playing' | 'won' | 'lost';
}

const MAX_DT = 0.1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWave(chapterIndex: number, slugs: string[], seed: number, genericReal = 0): Wave {
  const rand = mulberry32(seed);
  const ramp = TUNING.rampPerChapter ** chapterIndex;
  const flight = TUNING.flight * ramp;
  const spacing = TUNING.spacing * ramp;

  const reals: (string | null)[] = [...slugs, ...Array.from({ length: genericReal }, () => null)];
  const decoyCount = Math.max(
    2,
    Math.round((reals.length * TUNING.decoyShare) / (1 - TUNING.decoyShare)),
  );

  const slots: ('real' | 'decoy')[] = reals.map(() => 'real');
  for (let i = 0; i < decoyCount; i++) {
    slots.splice(Math.floor(rand() * (slots.length + 1)), 0, 'decoy');
  }

  let nextReal = 0;
  const arrows: Arrow[] = slots.map((kind, i) => ({
    id: i,
    kind,
    eventSlug: kind === 'real' ? reals[nextReal++] : null,
    launch: i * spacing + (rand() - 0.5) * spacing * 0.2,
    flight,
    lane: Math.floor(rand() * (2 * LANE_RANGE + 1)) - LANE_RANGE,
    state: 'flying',
  }));
  return { arrows };
}

export function startRun(wave: Wave): Run {
  return {
    t: 0,
    wave: { arrows: wave.arrows.map((a) => ({ ...a })) },
    caught: [],
    misses: 0,
    decoysTaken: 0,
    score: 0,
    sight: false,
    result: 'playing',
  };
}

export function step(run: Run, dt: number): Run {
  if (run.result !== 'playing') return run;
  const scaled = Math.min(Math.max(dt, 0), MAX_DT) * (run.sight ? TUNING.sightSlow : 1);
  const t = run.t + scaled;
  let misses = run.misses;
  const arrows = run.wave.arrows.map((a) => {
    if (a.state !== 'flying' || t < a.launch + a.flight) return a;
    if (a.kind === 'real') {
      misses++;
      return { ...a, state: 'missed' as const };
    }
    return { ...a, state: 'passed' as const };
  });
  const resolved = arrows.every((a) => a.state !== 'flying');
  const result = misses >= TUNING.missLimit ? 'lost' : resolved ? 'won' : 'playing';
  return { ...run, t, misses, wave: { arrows }, result };
}

export function catchArrow(run: Run, id: number): Run {
  if (run.result !== 'playing') return run;
  const arrow = run.wave.arrows.find((a) => a.id === id);
  if (!arrow || arrow.state !== 'flying') return run;
  const arrows = run.wave.arrows.map((a) => (a.id === id ? { ...a, state: 'caught' as const } : a));
  if (arrow.kind === 'real') {
    const resolved = arrows.every((a) => a.state !== 'flying');
    return {
      ...run,
      wave: { arrows },
      caught: [...run.caught, id],
      score: run.score + TUNING.pointsReal,
      result: resolved ? 'won' : 'playing',
    };
  }
  const decoysTaken = run.decoysTaken + 1;
  return {
    ...run,
    wave: { arrows },
    decoysTaken,
    result: decoysTaken >= TUNING.decoyLimit ? 'lost' : 'playing',
  };
}

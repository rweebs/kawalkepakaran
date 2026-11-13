// How much of the battle each device draws. Phones get fewer warriors, arrows and particles, no bloom pass and a lower
// pixel ratio; desktops get the full scene and keep bloom only while the frame rate holds up.
export interface Quality {
  warriorsPerSide: number;
  arrows: number;
  dust: number;
  embers: number;
  terrainSegments: number;
  skirmishPairs: number;
  /** Grass tufts and rocks scattered on the ground outside the field. */
  tufts: number;
  rocks: number;
  /** Ranks at the front of each army drawn as the real, baked-animation soldier; the rest stay procedural. */
  realRanks: number;
  /** Skirmish fighters (both sides together) drawn as the real soldier. */
  realFighters: number;
  cavalry: number;
  elephants: number;
  shadowMap: number;
  bloom: boolean;
  shadows: boolean;
  ao: boolean;
  dof: boolean;
  pixelRatio: number;
  /** Width and depth of the square terrain (m): 260 on the page, 720 in the game. */
  terrainSize: number;
}

/** `cores` is navigator.hardwareConcurrency; a desktop reporting four or fewer gets a lighter army and shadow map. */
export function qualityFor(mobile: boolean, dpr: number, cores = 8): Quality {
  const full = fullQuality(mobile, dpr);
  if (mobile || cores > 4) return full;
  return { ...full, warriorsPerSide: 1200, realRanks: 3, realFighters: 60, shadowMap: 1024, cavalry: 16, elephants: 4, tufts: 800, rocks: 40 };
}

function fullQuality(mobile: boolean, dpr: number): Quality {
  return mobile
    ? {
      warriorsPerSide: 700, arrows: 48, dust: 140, embers: 90, terrainSegments: 96, skirmishPairs: 28, tufts: 360, rocks: 24, realRanks: 2, realFighters: 24, cavalry: 8, elephants: 2,
      shadowMap: 0, bloom: false, shadows: false, ao: false, dof: false, pixelRatio: Math.min(dpr, 1.25), terrainSize: 260,
    }
    : {
      warriorsPerSide: 1800, arrows: 140, dust: 360, embers: 240, terrainSegments: 200, skirmishPairs: 90, tufts: 1400, rocks: 70, realRanks: 6, realFighters: 120, cavalry: 28, elephants: 6,
      shadowMap: 2048, bloom: true, shadows: true, ao: true, dof: true, pixelRatio: Math.min(dpr, 1.5), terrainSize: 260,
    };
}

export const GAME_WARRIORS_PER_SIDE = 1024;

/**
 * The game's tier, from the device's page tier: at most 1024 soldiers a side, nothing for the battle layer (skirmishes and
 * their real fighters, cavalry, elephants), no arrows or rocks, no ambient occlusion or depth of field, and the 720 m terrain
 * with more segments. Bloom, shadows and the pixel ratio stay the device's.
 */
export function gameQuality(q: Quality): Quality {
  return {
    ...q,
    warriorsPerSide: Math.min(q.warriorsPerSide, GAME_WARRIORS_PER_SIDE),
    skirmishPairs: 0, realFighters: 0, cavalry: 0, elephants: 0, arrows: 0, rocks: 0,
    ao: false, dof: false,
    terrainSize: 720,
    terrainSegments: q.terrainSegments >= 200 ? 256 : 128,
  };
}

/** The post-processing and lighting effects that can be switched off when the frame rate falls. */
export interface Effects { ao: boolean; dof: boolean; bloom: boolean; shadows: boolean }

/** Turns off the single most expensive effect still on, in order of cost: ambient occlusion, depth of field, bloom, shadows. */
export function degrade(fx: Effects): Effects {
  if (fx.ao) return { ...fx, ao: false };
  if (fx.dof) return { ...fx, dof: false };
  if (fx.bloom) return { ...fx, bloom: false };
  if (fx.shadows) return { ...fx, shadows: false };
  return { ...fx };
}

export const FPS_FLOOR = 45;
const MIN_SAMPLES = 60;

/** True once enough frames have been timed and their average rate is below the floor. */
export function shouldDropBloom(frameMs: readonly number[], floor = FPS_FLOOR): boolean {
  if (frameMs.length < MIN_SAMPLES) return false;
  const avg = frameMs.reduce((a, b) => a + b, 0) / frameMs.length;
  return 1000 / avg < floor;
}

// The game's frame-rate watch, in plain numbers: the pixel ratios a slow device steps down through, when it is offered the
// version without animation, and the scroll progress that gives the scene a dawn mix. No three.js and no clock of its own:
// the runtime passes each frame's dt and the real clock.

/** The pixel ratios a slow device steps down through, highest first. */
export const PIXEL_STEPS = [1.5, 1.25, 1, 0.85] as const;
/** The pixel-ratio step looks at the last STEP_FRAMES frames, and steps when they average over STEP_MS (about 28 fps). */
export const STEP_FRAMES = 90;
export const STEP_MS = 36;
/** A device whose frames average over STILL_MS (20 fps) for STILL_SECONDS at the lowest pixel ratio is offered the still version. */
export const STILL_SECONDS = 5;
export const STILL_MS = 50;
/**
 * The scene's cap on a frame's dt (s): its frame takes min(ms / 1000, 0.05). Under the cap the dt is the frame's real
 * time, and it leaves a pause out, since the scene restarts its clock when it resumes. At the cap the frame took longer.
 */
export const SCENE_DT_CAP = 0.05;
/**
 * The most a frame at the cap counts for (ms), timed by the real clock's gap since the last frame. Slow frames (over 36 or
 * 50 ms) still count as slow; a longer stall, or a hidden tab the scene did not pause for, counts as no more than this.
 */
export const GAP_MS = 250;
/** Real time (ms) left untimed by hold(): a chapter's first second, while the shaders of what it shows compile. */
export const HOLD_MS = 1000;
/** dharmaMix (stage-math) is smoothstep(MIX_FROM, 1, progress): 0 up to here, rising to 1 at the end. */
const MIX_FROM = 0.75;

/** One step down PIXEL_STEPS from `current` when the frames average over STEP_MS; otherwise, or below the lowest, `current`. */
export function nextPixelRatio(current: number, avgMs: number): number {
  if (!(avgMs > STEP_MS)) return current;
  for (const r of PIXEL_STEPS) if (r < current) return r;
  return current;
}

/** Whether a device averaging `avgMs5s` ms a frame over 5 s at `pixelRatio` should be offered the version without animation. */
export function shouldOfferStill(avgMs5s: number, pixelRatio: number): boolean {
  return avgMs5s > STILL_MS && pixelRatio <= PIXEL_STEPS[PIXEL_STEPS.length - 1];
}

/**
 * The scroll progress whose dharmaMix is `mix`, taken in the dawn's last quarter: 0.75 for 0, 1 for 1. A mix outside 0 to 1
 * is clamped, and one that is not a number counts as 0.
 */
export function progressForMix(mix: number): number {
  const m = Number.isFinite(mix) ? mix : 0;
  if (m <= 0) return MIX_FROM;
  if (m >= 1) return 1;
  // smoothstep's 3t² − 2t³ turned round: t = 1/2 − sin(asin(1 − 2m) / 3).
  const t = 0.5 - Math.sin(Math.asin(1 - 2 * m) / 3);
  return MIX_FROM + (1 - MIX_FROM) * t;
}

export interface FrameWatch {
  /**
   * Times one frame from the scene's `dt` (s) and the real clock (ms). Under SCENE_DT_CAP the frame takes dt; at the cap,
   * the clock's gap since the last frame, at most GAP_MS. A frame with no time on the clock it is timed by (dt 0 or less,
   * a gap not yet known, stalled or run back) is skipped.
   */
  frame(dt: number, nowMs: number): void;
  /** Leaves the next HOLD_MS of frames untimed: a frame that begins inside it is not counted. */
  hold(): void;
  /** The pixel ratio the watch has set, or the one it started from. */
  readonly pixelRatio: number;
}

/** A frame's real time (ms): its dt under the scene's cap, else the clock's gap up to GAP_MS; NaN when that clock shows none. */
function frameMs(dt: number, gap: number): number {
  if (dt > 0 && dt < SCENE_DT_CAP) return dt * 1000;
  if (dt >= SCENE_DT_CAP && gap > 0) return Math.min(gap, GAP_MS);
  return NaN;
}

/**
 * Watches the frame rate from `pixelRatio`: steps the ratio down (calling setPixelRatio) when the last 90 frames average
 * over 36 ms, then judges the next 90 afresh, and calls `slow` once when a 5 s stretch at the lowest ratio averages over
 * 50 ms. It never steps back up. Nothing is allocated per frame.
 */
export function watchFrames(pixelRatio: number, on: { setPixelRatio(r: number): void; slow(): void }): FrameWatch {
  const ring = new Float64Array(STEP_FRAMES);
  let count = 0;
  let head = 0;
  let sum = 0;
  let spanMs = 0;
  let spanFrames = 0;
  let last = NaN;
  let holdMs = 0;
  let ratio = pixelRatio;
  let offered = false;

  /** A fresh start for both averages, after a step: no frame from the old ratio counts at the new one. */
  const restart = () => {
    count = 0;
    head = 0;
    sum = 0;
    spanMs = 0;
    spanFrames = 0;
  };

  return {
    get pixelRatio() {
      return ratio;
    },
    hold() {
      holdMs = HOLD_MS;
    },
    frame(dt, nowMs) {
      const ms = frameMs(dt, nowMs - last);
      last = nowMs;
      if (!(ms > 0)) return;
      if (holdMs > 0) {
        holdMs -= ms;
        return;
      }
      if (count === STEP_FRAMES) sum -= ring[head];
      else count++;
      ring[head] = ms;
      sum += ms;
      head = (head + 1) % STEP_FRAMES;
      spanMs += ms;
      spanFrames++;
      if (count === STEP_FRAMES) {
        const next = nextPixelRatio(ratio, sum / count);
        if (next !== ratio) {
          ratio = next;
          restart();
          on.setPixelRatio(next);
          return;
        }
      }
      if (spanMs >= STILL_SECONDS * 1000) {
        if (!offered && shouldOfferStill(spanMs / spanFrames, ratio)) {
          offered = true;
          on.slow();
        }
        spanMs = 0;
        spanFrames = 0;
      }
    },
  };
}

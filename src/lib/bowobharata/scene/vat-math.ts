// Layout and timing for vertex animation textures: every vertex of every baked frame lives in one 2D texture, and the vertex
// shader reads two neighbouring frames and blends them. These functions mirror what the shader does, so they can be tested.

export interface VatLayout {
  /** Texels per row. */
  width: number;
  /** A frame with more vertices than `width` wraps onto this many rows. */
  rowsPerFrame: number;
  frames: number;
  /** Total rows in the texture. */
  height: number;
}

export function vatLayout(vertexCount: number, frames: number, width = 2048): VatLayout {
  const rowsPerFrame = Math.max(1, Math.ceil(vertexCount / width));
  return { width, rowsPerFrame, frames, height: rowsPerFrame * frames };
}

/** The texel that holds `vertex` in `frame`: a frame's rows are contiguous, so one frame never spills into the next. */
export function texelOf(l: VatLayout, vertex: number, frame: number): { x: number; y: number } {
  return { x: vertex % l.width, y: frame * l.rowsPerFrame + Math.floor(vertex / l.width) };
}

export interface ClipRange { start: number; frames: number; duration: number }

/** Lays the wanted clips out one after another in the frame axis; clips that were not asked for are left out. */
export function planClips(clips: readonly { name: string; duration: number }[], framesPerClip: Record<string, number>): Record<string, ClipRange> {
  const plan: Record<string, ClipRange> = {};
  let start = 0;
  for (const c of clips) {
    const frames = framesPerClip[c.name];
    if (!frames) continue;
    plan[c.name] = { start, frames, duration: c.duration };
    start += frames;
  }
  return plan;
}

/** Which two frames of a looping clip to blend at `time`, and by how much; `phase` (0..1) puts each soldier out of step. */
export function frameBlend(time: number, duration: number, frames: number, phase: number): { f0: number; f1: number; mix: number } {
  const turn = time / duration + phase;
  const t = (turn - Math.floor(turn)) * frames;
  const f0 = Math.min(Math.floor(t), frames - 1);
  return { f0, f1: (f0 + 1) % frames, mix: Math.min(t - f0, 0.999999) };
}

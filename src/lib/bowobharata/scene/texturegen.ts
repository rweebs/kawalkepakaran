import { mulberry32 } from '../../sky/rng';

const fade = (t: number) => t * t * (3 - 2 * t);

/**
 * Tileable value noise as a square height field in 0..1: `cells` lattice cells across at the first octave, doubling for
 * each further octave, every lattice wrapping at the edge so the texture repeats without a seam.
 */
export function heightField(size: number, seed: number, cells: number, octaves: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells * 2 ** o;
    const rnd = mulberry32(seed * 7919 + o * 104729);
    const lattice = Float32Array.from({ length: n * n }, () => rnd());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n;
      const y0 = Math.floor(fy) % n;
      const y1 = (y0 + 1) % n;
      const ty = fade(fy - Math.floor(fy));
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const x0 = Math.floor(fx) % n;
        const x1 = (x0 + 1) % n;
        const tx = fade(fx - Math.floor(fx));
        const top = lattice[y0 * n + x0] * (1 - tx) + lattice[y0 * n + x1] * tx;
        const bottom = lattice[y1 * n + x0] * (1 - tx) + lattice[y1 * n + x1] * tx;
        out[y * size + x] += (top * (1 - ty) + bottom * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** An over-and-under cloth weave: `threads` threads across the tile, so it repeats once per thread and tiles at the edge. */
export function weaveField(size: number, threads: number): Float32Array {
  const out = new Float32Array(size * size);
  const k = (Math.PI * 2 * threads) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.sin(x * k);
      const weft = Math.sin(y * k);
      out[y * size + x] = 0.5 + 0.25 * warp * (weft > 0 ? 1 : -1) + 0.25 * weft * (warp > 0 ? 1 : -1) * 0.6;
    }
  }
  return out;
}

/** Turns a height field into an RGBA normal map (tangent space, +y up), wrapping at the edges so it tiles. */
export function normalFromHeight(h: Float32Array, size: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

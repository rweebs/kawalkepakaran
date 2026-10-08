const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));

export function tiltFor(px: number, py: number, w: number, h: number, max: number): { rotateX: number; rotateY: number } {
  if (w <= 0 || h <= 0) return { rotateX: 0, rotateY: 0 };
  const rotateY = clamp((px / w - 0.5) * 2 * max, max);
  const rotateX = clamp(-(py / h - 0.5) * 2 * max, max);
  return { rotateX: rotateX === 0 ? 0 : rotateX, rotateY: rotateY === 0 ? 0 : rotateY };
}

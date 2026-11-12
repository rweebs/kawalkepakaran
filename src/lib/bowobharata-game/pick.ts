export interface ScreenPoint { id: number; x: number; y: number }

/** Id of the point closest to the tap, or null when none lies within `radiusPx`. */
export function pickNearest(points: readonly ScreenPoint[], tap: { x: number; y: number }, radiusPx: number): number | null {
  let best: number | null = null;
  let bestD = radiusPx * radiusPx;
  for (const p of points) {
    const d = (p.x - tap.x) ** 2 + (p.y - tap.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

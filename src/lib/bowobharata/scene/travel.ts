/**
 * The shader code that makes an instance run across the field and start over: the one definition both the procedural riders and
 * the baked horses use, so a rider and the horse under him always travel in step. It needs `uTravel` (speed in x, the length of
 * the run in y), the clock `uTime`, the per-instance `aPhase`, and a `transformed` position to move.
 */
export const TRAVEL_GLSL = `
if (uTravel.y > 0.0) {
  float travelU = fract(uTime * uTravel.x / uTravel.y + aPhase);
  transformed.x += (travelU - 0.5) * uTravel.y;
  transformed *= smoothstep(0.0, 0.07, travelU) * (1.0 - smoothstep(0.93, 1.0, travelU));
}`;

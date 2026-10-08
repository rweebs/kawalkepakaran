// A swift seen from above: slim spindle body, forked tail, long sickle wings.
// Nose points to +z. Triangles are listed as flat xyz triples.
type V = [number, number, number];

const NOSE: V = [0, 0, 0.55];
const SHOULDER_L: V = [-0.1, 0, 0.1];
const SHOULDER_R: V = [0.1, 0, 0.1];
const TAIL: V = [0, 0, -0.45];
const FORK_L: V = [-0.13, 0, -0.78];
const FORK_R: V = [0.13, 0, -0.78];

const mirror = (v: V): V => [-v[0], v[1], v[2]];
const WING_FRONT: V = [-0.08, 0, 0.26];
const WING_BACK: V = [-0.08, 0, -0.06];
const WING_LEAD: V = [-0.55, 0, 0.12];
const WING_TIP: V = [-1.0, 0, -0.5];

const tris: V[][] = [
  [NOSE, SHOULDER_L, SHOULDER_R],
  [SHOULDER_L, SHOULDER_R, TAIL],
  [SHOULDER_L, TAIL, FORK_L],
  [SHOULDER_R, TAIL, FORK_R],
  [WING_FRONT, WING_LEAD, WING_BACK],
  [WING_LEAD, WING_TIP, WING_BACK],
  [mirror(WING_FRONT), mirror(WING_LEAD), mirror(WING_BACK)],
  [mirror(WING_LEAD), mirror(WING_TIP), mirror(WING_BACK)],
];

export const BIRD_POSITIONS: readonly number[] = tris.flat(2);

// Where the stone (batu sijjil) hangs, in the bird's local space, and its radius.
export const STONE_LOCAL = { x: 0, y: -0.14, z: 0.22 } as const;
export const STONE_RADIUS = 0.09;

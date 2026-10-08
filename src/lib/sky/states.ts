export interface Vec3 { x: number; y: number; z: number }
export type SkyState = 'circle' | 'status';

export const HOME_SECTIONS = ['operasi', 'siapa', 'bukti', 'kontribusi', 'jawaban'] as const;

export const SECTION_STATE: Record<string, SkyState> = {
  operasi: 'circle',
  siapa: 'circle',
  bukti: 'circle',
  kontribusi: 'circle',
  jawaban: 'status',
};

export function stateForSection(id: string): SkyState {
  return SECTION_STATE[id] ?? 'circle';
}

export const CAMERA_POSES: Record<SkyState, { pos: Vec3; look: Vec3 }> = {
  circle: { pos: { x: 0, y: 1.2, z: 11 }, look: { x: 0, y: 1.5, z: 0 } },
  status: { pos: { x: 0, y: 3, z: 8 }, look: { x: 0, y: 3, z: -4 } },
};

// True when the viewport bottom is at (or within `tolerance` px of) the page bottom and the
// page can scroll. Short last sections never reach the middle of the viewport, so the scene
// uses this to switch to the last section's state.
export function atPageBottom(scrollY: number, viewportHeight: number, scrollHeight: number, tolerance = 8): boolean {
  return scrollHeight > viewportHeight && scrollY + viewportHeight >= scrollHeight - tolerance;
}

// The 3D models used by the battle scene, all by Quaternius from Poly Pizza, and what their licences require. They are
// compressed with meshopt and served from this site (public/models); the scene loads them only after the first
// interaction and falls back to its own procedural shapes if they cannot be loaded.
export interface ModelInfo {
  url: string;
  author: 'Quaternius';
  license: 'CC0 1.0' | 'CC BY 3.0';
  source: string;
  what: string;
}

export const MODELS = {
  horse: { url: '/models/horse.glb', author: 'Quaternius', license: 'CC0 1.0', source: 'https://poly.pizza/m/qvTrSG9pZF', what: 'Kuda dengan animasi tulang (berjalan, berlari, diam)' },
  base: { url: '/models/base.glb', author: 'Quaternius', license: 'CC BY 3.0', source: 'https://poly.pizza/m/cwYvO5UauX', what: 'Rangka tubuh manusia untuk tokoh utama' },
  human: { url: '/models/human.glb', author: 'Quaternius', license: 'CC0 1.0', source: 'https://poly.pizza/m/c3Ibh9I3udk', what: 'Prajurit dengan animasi tulang (berjalan, berlari, menyerang)' },
} as const satisfies Record<string, ModelInfo>;

export const CREDITS = [
  { source: MODELS.base.source, text: 'Rangka tubuh tokoh: "Animated Base Character" oleh Quaternius, lisensi CC BY 3.0, dari Poly Pizza. Dimodifikasi: diberi busana dan pose.' },
  { source: MODELS.horse.source, text: 'Kuda: "Horse" oleh Quaternius, domain publik (CC0), dari Poly Pizza.' },
  { source: MODELS.human.source, text: 'Prajurit: "Animated Human" oleh Quaternius, domain publik (CC0), dari Poly Pizza.' },
] as const;

export const CREDITS_EN = [
  { source: MODELS.base.source, text: 'Character body rig: "Animated Base Character" by Quaternius, CC BY 3.0 licence, from Poly Pizza. Modified: dressed and posed.' },
  { source: MODELS.horse.source, text: 'Horse: "Horse" by Quaternius, public domain (CC0), from Poly Pizza.' },
  { source: MODELS.human.source, text: 'Soldier: "Animated Human" by Quaternius, public domain (CC0), from Poly Pizza.' },
] as const;

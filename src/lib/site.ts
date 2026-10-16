export const SITE = {
  name: 'Kawal Kepakaran',
  description: 'Kawal terbuka atas klaim para pakar: kredensial, bukti, dan hak jawab.',
  url: 'https://kawalkepakaran.org',
  repo: 'https://github.com/rweebs/kawalkepakaran',
  author: 'Rahmat Wibowo',
  replyEmail: 'rahmat.wibowo21@gmail.com',
  correctionsEmail: 'rahmat.wibowo21@gmail.com',
  // Search Console token for the new domain; empty until the owner registers kawalkepakaran.org.
  googleVerification: '',
  // Bing Webmaster token and the X handle (with @); both empty until the owner sets them, and their tags are left out until then.
  bingVerification: '',
  x: '',
} as const;

// The author as one schema.org Person, named by every Article and the WebSite. Its @id lives on the about page.
export const AUTHOR = {
  name: SITE.author,
  '@id': `${SITE.url}/tentang#person`,
  url: `${SITE.url}/tentang`,
  urlEn: `${SITE.url}/en/about`,
} as const;

// Profiles for schema.org sameAs. Only URLs already linked from this repository (source in each comment); never guessed.
// The owner may add more verified profiles here; an empty list is fine and is left out of the output.
export const SAME_AS: { author: readonly string[]; organization: readonly string[] } = {
  author: [
    'https://github.com/rweebs', // owner of SITE.repo
    'https://www.tiktok.com/@rweebs_', // src/lib/tiktok.ts TIKTOK_AUTHOR
    'https://www.linkedin.com/in/rahmatwi/', // src/lib/tentang.ts LINKEDIN_URL
  ],
  organization: [
    SITE.repo,
    // The TikTok account is the author's personal one, so it stays on the Person only.
  ],
};

export const DISCLAIMER =
  'Situs ini memuat pendapat dan catatan pribadi Rahmat Wibowo. Isinya bukan temuan kepolisian maupun putusan pengadilan, ' +
  'dan tidak menyatakan bahwa siapa pun yang disebut bersalah. Setiap orang berhak atas praduga tak bersalah dan hak jawab.';

export const CLASSIFICATION_LABEL = {
  'pendapat': 'Pendapat',
  'fakta-dengan-bukti': 'Fakta dengan bukti',
  'laporan-aduan': 'Laporan/aduan',
} as const;

// Date each static page's content last changed. The sitemap now takes the git date of each page's source files
// (src/lib/sitemap-entries.ts) and uses these only as a floor and as the fallback when git is missing or the clone is shallow.
export const PAGE_LASTMOD = { '/pakar': '2026-10-09', '/klaim': '2026-10-09', '/metode': '2026-10-10', '/glosarium': '2026-10-16', '/kasus/abil-sudarman': '2026-10-09', '/hak-jawab': '2026-10-10', '/kebijakan': '2026-10-10', '/disclaimer': '2026-10-04', '/kasus/abil-sudarman/bukti': '2026-10-04', '/videos': '2026-10-04', '/buku': '2026-10-04', '/tiktok': '2026-10-05', '/tentang': '2026-10-05', '/manifesto': '2026-10-09', '/kasus/abil-sudarman/linimasa': '2026-10-05', '/kasus/abil-sudarman/linimasa-abil': '2026-10-09', '/kasus/abil-sudarman/bowobharata': '2026-10-05', '/usulkan': '2026-10-16' } as const;

export interface NavLink { href: string; label: string }
export type NavEntry = NavLink | { label: string; items: readonly NavLink[] };

// Grouped by what a visitor wants to do: find an expert, check a claim, learn the method, read a case, watch or download, learn about the project, reply.
export const NAV_GROUPS: readonly NavEntry[] = [
  { href: '/pakar', label: 'Pakar' },
  { href: '/klaim', label: 'Cek klaim' },
  { href: '/metode', label: 'Metode' },
  { label: 'Kasus', items: [
    { href: '/kasus/abil-sudarman', label: 'Ringkasan Kasus 001' },
    { href: '/kasus/abil-sudarman/artikel', label: 'Artikel' },
    { href: '/kasus/abil-sudarman/bukti', label: 'Bukti' },
    { href: '/kasus/abil-sudarman/linimasa', label: 'Linimasa' },
    { href: '/kasus/abil-sudarman/linimasa-abil', label: 'Linimasa Abil' },
    { href: '/arsip', label: 'Arsip Perkara' },
    { href: '/kasus/abil-sudarman/bowobharata', label: 'Bowobharata' },
  ] },
  { label: 'Media', items: [
    { href: '/videos', label: 'Video' },
    { href: '/tiktok', label: 'TikTok' },
    { href: '/buku', label: 'Buku' },
  ] },
  { label: 'Tentang', items: [
    { href: '/tentang', label: 'Tentang penggagas' },
    { href: '/manifesto', label: 'Manifesto' },
    { href: '/#kontribusi', label: 'Kontribusi' },
    { href: '/disclaimer', label: 'Disclaimer' },
    { href: '/kebijakan', label: 'Kebijakan' },
  ] },
  { href: '/hak-jawab', label: 'Hak jawab' },
];

/** Every link in the menu, flattened. */
export const NAV: readonly NavLink[] = NAV_GROUPS.flatMap((e) => ('items' in e ? e.items : [e]));

/** Exact match or a child path, so /artikel is active on /artikel/x but /buku is not active on /bukti. Anchors are never active. */
export function isActive(path: string, href: string): boolean {
  if (href.includes('#')) return false;
  // The case overview sits in the same menu group as its own child pages, so it is only current on itself.
  if (EXACT_ONLY.has(href)) return path === href;
  return path === href || path.startsWith(`${href}/`);
}
const EXACT_ONLY = new Set(['/kasus/abil-sudarman', '/en/cases/abil-sudarman']);

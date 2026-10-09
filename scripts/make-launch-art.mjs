// Draws the illustrations of the launch article as SVG and renders them to PNG with sharp.
// Run: node scripts/make-launch-art.mjs
// Output: public/img/peluncuran-kawal-kepakaran-001.png (header, no text, shared by both languages)
//         public/img/peluncuran-kawal-kepakaran-002-id.png and -002-en.png (the four verdicts, one per language)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const W = 1600;
const H = 900;
const GOLD = '#e3b341';

const stars = (n, seed = 1) => Array.from({ length: n }, (_, i) => {
  const x = ((i + seed) * 197) % W;
  const y = ((i + seed) * 89) % H;
  const r = 0.9 + (((i + seed) * 7) % 4) * 0.55;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfd8ff" opacity="${0.3 + (((i + seed) * 13) % 6) / 10}"/>`;
}).join('');

const sky = `<defs>
  <radialGradient id="sky" cx="58%" cy="30%" r="90%">
    <stop offset="0" stop-color="#1b2347"/><stop offset="0.55" stop-color="#0d1229"/><stop offset="1" stop-color="#070a16"/>
  </radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="${GOLD}" stop-opacity="0.28"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>`;

// One swift carrying a stone, centred at (0,0).
const bird = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M0 -10 C-30 -34 -80 -38 -118 -4 C-78 -8 -46 4 -8 28 Z" fill="#9fb0d0" opacity="0.9"/>
  <path d="M0 -10 C30 -34 80 -38 118 -4 C78 -8 46 4 8 28 Z" fill="#9fb0d0" opacity="0.9"/>
  <ellipse cx="0" cy="8" rx="14" ry="38" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
  <circle cx="0" cy="-34" r="11" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
  <path d="M-10 40 L0 76 L10 40 Z" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
  <circle cx="0" cy="58" r="12" fill="#e08a2e"/><circle cx="-4" cy="54" r="3.6" fill="#ffd9a0"/>
</g>`;

// ---------- header: a pair of scales inside a wayang gunungan; a claim card on one pan, a stone of evidence on the other
const flock = [
  [250, 170, 0.95, -12], [330, 340, 0.6, 8], [1290, 190, 0.8, 12],
  [1430, 400, 0.55, -8], [1210, 700, 0.5, 10], [250, 690, 0.55, -14], [380, 520, 0.4, 6],
].map(([x, y, s, r]) => bird(x, y, s, r)).join('');

const header = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${sky}
  ${stars(170)}
  <ellipse cx="800" cy="470" rx="520" ry="470" fill="url(#glow)"/>
  ${flock}
  <g transform="translate(416 86) scale(12)">
    <circle cx="32" cy="32" r="30.5" fill="#0b1020" fill-opacity="0.55" stroke="${GOLD}" stroke-width="0.45" stroke-opacity="0.7"/>
    <path d="M32 8 C38 15 44 21 44 32 C44 43 38 51 32 56 C26 51 20 43 20 32 C20 21 26 15 32 8 Z" fill="#1a2147" stroke="${GOLD}" stroke-width="0.7"/>
    <g stroke="${GOLD}" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M23.5 27 H40.5"/><path d="M32 21 V45"/><path d="M27.5 45 H36.5"/>
      <path d="M23.5 27 L21 34 H26 Z"/><path d="M40.5 27 L38 34 H43 Z"/>
    </g>
    <rect x="21.7" y="29.4" width="3.6" height="4.2" rx="0.4" fill="#e6edf8"/>
    <g stroke="#8a97b3" stroke-width="0.25"><path d="M22.4 30.4 H24.6"/><path d="M22.4 31.4 H24.6"/><path d="M22.4 32.4 H23.8"/></g>
    <circle cx="40.5" cy="32.6" r="1.5" fill="#e08a2e"/><circle cx="40" cy="32.1" r="0.45" fill="#ffd9a0"/>
    <circle cx="32" cy="19.4" r="1.8" fill="${GOLD}"/>
  </g>
</svg>`;

// ---------- the four verdicts
const VERDICT = [
  { color: '#6ee7a0', glyph: 'check' },
  { color: '#fcd34d', glyph: 'half' },
  { color: '#fda4af', glyph: 'cross' },
  { color: '#a5c8ff', glyph: 'question' },
];

const COPY = {
  id: {
    title: 'Empat putusan', sub: 'Cara Kawal Kepakaran menilai sebuah klaim',
    cards: [
      { label: ['Dikonfirmasi'], def: ['Penerbit kredensial atau', 'sumber primer menguatkan', 'klaim.'] },
      { label: ['Sebagian'], def: ['Sebagian klaim terkuatkan,', 'sebagian lain tidak atau', 'berbeda dari yang dinyatakan.'] },
      { label: ['Tidak terbukti'], def: ['Sumber yang semestinya ada', 'sudah dicari dan tidak', 'menguatkan. Bukan berarti', 'klaimnya pasti salah.'] },
      { label: ['Belum bisa', 'diverifikasi'], def: ['Belum ada sumber yang bisa', 'dihubungi atau ditemukan;', 'menunggu konfirmasi.'] },
    ],
    foot: 'Setiap putusan memuat tingkat keyakinan dan bagian “yang tidak dibuktikan”.',
  },
  en: {
    title: 'Four verdicts', sub: 'How Kawal Kepakaran judges a claim',
    cards: [
      { label: ['Confirmed'], def: ['The credential issuer or a', 'primary source supports', 'the claim.'] },
      { label: ['Partly'], def: ['Part of the claim is', 'supported; part is not or', 'differs from what was said.'] },
      { label: ['Not supported'], def: ['The sources that should', 'exist were sought and do', 'not support it. Not proof', 'that it is false.'] },
      { label: ['Cannot yet', 'be verified'], def: ['No source could yet be', 'reached or found; we are', 'waiting for confirmation.'] },
    ],
    foot: 'Every verdict carries a confidence level and a “what this does not prove” section.',
  },
};

const glyph = (kind, color) => {
  const s = `stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (kind === 'check') return `<path d="M-26 2 L-8 20 L28 -22" ${s}/>`;
  if (kind === 'cross') return `<path d="M-22 -22 L22 22 M22 -22 L-22 22" ${s}/>`;
  if (kind === 'half') return `<circle r="30" stroke="${color}" stroke-width="8" fill="none"/><path d="M0 -30 A30 30 0 0 0 0 30 Z" fill="${color}"/>`;
  return `<text x="0" y="28" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="88" font-weight="700" fill="${color}">?</text>`;
};

const diagram = (lang) => {
  const c = COPY[lang];
  const cardW = 340;
  const gap = 30;
  const x0 = (W - (4 * cardW + 3 * gap)) / 2;
  const cards = c.cards.map((card, i) => {
    const x = x0 + i * (cardW + gap);
    const cx = x + cardW / 2;
    const { color, glyph: g } = VERDICT[i];
    const labelStart = 484 - (card.label.length - 1) * 22;
    const label = card.label.map((t, k) => `<text x="${cx}" y="${labelStart + k * 44}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700" fill="${color}">${t}</text>`).join('');
    const def = card.def.map((t, k) => `<text x="${cx}" y="${590 + k * 36}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="23" fill="#cbd5e1">${t}</text>`).join('');
    return `<rect x="${x}" y="215" width="${cardW}" height="520" rx="26" fill="#121a33" fill-opacity="0.88" stroke="#94a3b8" stroke-opacity="0.28"/>
  <circle cx="${cx}" cy="335" r="66" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="5"/>
  <g transform="translate(${cx} 335)">${glyph(g, color)}</g>
  ${label}${def}`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${sky}
  ${stars(110, 5)}
  <text x="${x0}" y="120" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="700" fill="#f1f5f9">${c.title}</text>
  <text x="${x0}" y="168" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="${GOLD}">${c.sub}</text>
  ${cards}
  <text x="${x0}" y="812" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#94a3b8">${c.foot}</text>
  <text x="${W - x0}" y="852" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#93c5fd">kawalkepakaran.org</text>
</svg>`;
};

mkdirSync('public/img', { recursive: true });
const png = (svg, file) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toFile(file);
for (const [svg, file] of [
  [header, 'public/img/peluncuran-kawal-kepakaran-001.png'],
  [diagram('id'), 'public/img/peluncuran-kawal-kepakaran-002-id.png'],
  [diagram('en'), 'public/img/peluncuran-kawal-kepakaran-002-en.png'],
]) {
  const info = await png(svg, file);
  console.log(`wrote ${file} (${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB)`);
}

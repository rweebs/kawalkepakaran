import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const W = 1200;
const H = 630;

// stars: deterministic positions
const stars = Array.from({ length: 110 }, (_, i) => {
  const x = (i * 197) % W;
  const y = (i * 89) % H;
  const r = 0.8 + ((i * 7) % 4) * 0.5;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#cfd8ff" opacity="${0.35 + ((i * 13) % 6) / 10}"/>`;
}).join('');

// one swift with a stone, centred at (0,0), body length ~ 90
function bird(x, y, s, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M0 -10 C-30 -34 -80 -38 -118 -4 C-78 -8 -46 4 -8 28 Z" fill="#9fb0d0" opacity="0.9"/>
    <path d="M0 -10 C30 -34 80 -38 118 -4 C78 -8 46 4 8 28 Z" fill="#9fb0d0" opacity="0.9"/>
    <ellipse cx="0" cy="8" rx="14" ry="38" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <circle cx="0" cy="-34" r="11" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <path d="M-10 40 L0 76 L10 40 Z" fill="#2a3040" stroke="#9fb0d0" stroke-width="3"/>
    <circle cx="0" cy="58" r="12" fill="#e08a2e"/><circle cx="-4" cy="54" r="3.6" fill="#ffd9a0"/>
  </g>`;
}

const flock = [
  [820, 150, 0.9, -12], [980, 250, 0.7, 8], [760, 545, 0.5, -14],
  [1010, 110, 0.5, 14], [880, 400, 0.55, -6], [1100, 360, 0.45, 18],
].map(([x, y, s, r]) => bird(x, y, s, r)).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sky" cx="62%" cy="22%" r="85%">
      <stop offset="0" stop-color="#1b2347"/><stop offset="0.55" stop-color="#0d1229"/><stop offset="1" stop-color="#070a16"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  ${flock}
  <g transform="translate(70 80) scale(1.15)">
    <circle cx="32" cy="32" r="31" fill="#0b1020" stroke="#e3b341" stroke-width="2.5"/>
    <path d="M32 8 C38 15 44 21 44 32 C44 43 38 51 32 56 C26 51 20 43 20 32 C20 21 26 15 32 8 Z" fill="#1a2147" stroke="#e3b341" stroke-width="1.5"/>
    <g stroke="#e3b341" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M23.5 27 H40.5"/><path d="M32 21 V45"/><path d="M27.5 45 H36.5"/><path d="M23.5 27 L21 34 H26 Z"/><path d="M40.5 27 L38 34 H43 Z"/></g>
  </g>
  <text x="170" y="140" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="700" fill="#f1f5f9" letter-spacing="3">KAWAL KEPAKARAN</text>
  <text x="70" y="330" font-family="Georgia, 'Times New Roman', serif" font-size="68" font-weight="700" fill="#f1f5f9">Menguji klaim para pakar</text>
  <text x="74" y="396" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#e3b341">Kredensial diperiksa · bukti dibuka · hak jawab</text>
  <text x="74" y="470" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#94a3b8">Catatan dan pendapat penulis, bukan putusan</text>
  <text x="74" y="570" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#93c5fd">kawalkepakaran.org</text>
</svg>`;

mkdirSync('public/og', { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og/kawal-og.png');
console.log('wrote public/og/kawal-og.png');

await sharp('public/logo-kawal.svg', { density: 384 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('wrote public/apple-touch-icon.png');

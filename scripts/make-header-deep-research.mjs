import sharp from 'sharp';

// One-off: header illustration for the deep-research article, 1672x941 like the other article headers.
// Shows the method (one confidence scale applied equally to two subjects), not any finding: no faces, no per-person scores.
const W = 1672;
const H = 941;
const OUT = 'public/img/deep-research-header.png';
const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

const grid = Array.from({ length: 28 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="${H}"/>`).join('')
  + Array.from({ length: 16 }, (_, i) => `<line x1="0" y1="${i * 64}" x2="${W}" y2="${i * 64}"/>`).join('');

const stars = Array.from({ length: 90 }, (_, i) => {
  const x = (i * 241) % W;
  const y = (i * 97) % H;
  return `<circle cx="${x}" cy="${y}" r="${0.8 + ((i * 7) % 3) * 0.5}" fill="#cfd8ff" opacity="${0.2 + ((i * 13) % 5) / 12}"/>`;
}).join('');

// A subject card: generic avatar, label, and neutral (unscored) evidence rows.
function card(x, label, org, accent) {
  const rows = [0, 1, 2, 3].map((i) => {
    const y = 330 + i * 62;
    return `<rect x="${x + 40}" y="${y}" width="28" height="28" rx="7" fill="none" stroke="${accent}" stroke-width="3" opacity="0.8"/>
      <rect x="${x + 88}" y="${y + 3}" width="${210 - (i % 2) * 50}" height="10" rx="5" fill="#94a3b8" opacity="0.55"/>
      <rect x="${x + 88}" y="${y + 19}" width="${140 + (i % 3) * 30}" height="8" rx="4" fill="#94a3b8" opacity="0.3"/>`;
  }).join('');
  return `<g>
    <rect x="${x}" y="190" width="400" height="430" rx="26" fill="#0f172a" fill-opacity="0.82" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
    <circle cx="${x + 70}" cy="262" r="34" fill="#1e293b" stroke="${accent}" stroke-width="3"/>
    <circle cx="${x + 70}" cy="252" r="11" fill="#64748b"/>
    <path d="M${x + 48} 285 q22 -22 44 0 v6 h-44z" fill="#64748b"/>
    <text x="${x + 122}" y="258" fill="#f1f5f9" font-family="${FONT}" font-size="30" font-weight="700">${label}</text>
    <text x="${x + 122}" y="288" fill="${accent}" font-family="${FONT}" font-size="22">${org}</text>
    <line x1="${x + 30}" y1="316" x2="${x + 370}" y2="316" stroke="#334155" stroke-width="2"/>
    ${rows}
  </g>`;
}

// Central confidence scale: five rising steps, the same for both subjects.
const steps = ['#475569', '#64748b', '#f59e0b', '#38bdf8', '#22c55e'];
const scale = steps.map((c, i) => `<rect x="${648 + i * 74}" y="${520 - (46 + i * 22)}" width="64" height="${46 + i * 22}" rx="10" fill="${c}" opacity="0.9"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="80%"><stop offset="0%" stop-color="#16204a"/><stop offset="60%" stop-color="#0a0e1a"/><stop offset="100%" stop-color="#060912"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/><stop offset="100%" stop-color="#f59e0b" stop-opacity="0.25"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g stroke="#94a3b8" stroke-opacity="0.07" stroke-width="1">${grid}</g>
  ${stars}

  <text x="${W / 2}" y="96" text-anchor="middle" fill="#f59e0b" font-family="${FONT}" font-size="26" font-weight="700" letter-spacing="6">LAPORAN RISET MENDALAM</text>
  <text x="${W / 2}" y="152" text-anchor="middle" fill="#f8fafc" font-family="${FONT}" font-size="54" font-weight="800">Verifikasi Kredensial Berskala Keyakinan</text>

  ${card(110, 'Subjek A', 'Infraloka', '#38bdf8')}
  ${card(W - 510, 'Subjek B', 'ASSAI', '#f59e0b')}

  <g>
    <rect x="610" y="190" width="452" height="430" rx="26" fill="#0f172a" fill-opacity="0.82" stroke="#475569" stroke-width="2"/>
    <text x="836" y="244" text-anchor="middle" fill="#f1f5f9" font-family="${FONT}" font-size="28" font-weight="700">Skala keyakinan yang sama</text>
    ${scale}
    <text x="680" y="568" text-anchor="middle" fill="#94a3b8" font-family="${FONT}" font-size="18">belum ada</text>
    <text x="978" y="568" text-anchor="middle" fill="#94a3b8" font-family="${FONT}" font-size="18">terkonfirmasi</text>
  </g>

  <g stroke="#64748b" stroke-width="3" stroke-dasharray="8 8" fill="none">
    <path d="M510 405 H610"/><path d="M1062 405 H1162"/>
  </g>

  <g transform="translate(730 352)">
    <circle cx="0" cy="0" r="74" fill="url(#glass)" stroke="#f8fafc" stroke-width="9"/>
    <path d="M52 52 L112 112" stroke="#f8fafc" stroke-width="16" stroke-linecap="round"/>
    <path d="M-30 4 l22 22 l42 -48" fill="none" stroke="#f8fafc" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <rect x="260" y="690" width="1152" height="80" rx="40" fill="#0f172a" fill-opacity="0.85" stroke="#38bdf8" stroke-opacity="0.5" stroke-width="2"/>
  <text x="${W / 2}" y="742" text-anchor="middle" fill="#e2e8f0" font-family="${FONT}" font-size="30" font-weight="600">Kerangka bukti yang sama diterapkan pada kedua subjek</text>

  <text x="${W / 2}" y="850" text-anchor="middle" fill="#94a3b8" font-family="${FONT}" font-size="24">Rahmat Wibowo (Infraloka) vs. Abil Sudarman (ASSAI) · pendapat penulis, bukan putusan</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
console.log(`wrote ${OUT}`);

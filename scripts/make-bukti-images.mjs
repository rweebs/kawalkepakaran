import sharp from 'sharp';

// Derive the two images the Bukti page needs from the originals in public/img. Idempotent: it always starts from the
// originals, so running it again gives the same files. Run by hand (`node scripts/make-bukti-images.mjs`) after changing it.
//
// Each derived image gets a thin source strip laid over its bottom margin: "Kasus 001 · kawalkepakaran.org/...". The strip
// sits only over blank margin below the evidence (the size stays the same, the evidence itself is not touched).
export const STRIP_TEXT = 'Kasus 001 · kawalkepakaran.org/kasus/abil-sudarman/bukti';

function strip(width, height) {
  const size = Math.round(height * 0.58);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0b1020"/>
  <text x="${Math.round(size * 0.8)}" y="${Math.round(height * 0.7)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#f1f5f9">${STRIP_TEXT.replace(/&/g, '&amp;')}</text>
</svg>`);
}

// 1) PDDikti record (1206x1781) with the NIM value covered by a solid box. The card's last line ends near y 1650;
//    the strip covers the empty bottom 36 px (card edge and page background).
const NIM_BOX = { left: 120, top: 915, width: 350, height: 75 };
const PD = { width: 1206, height: 1781, strip: 36 };
await sharp('public/img/e5e6eb087c371f40b7a5f231.png')
  .composite([
    { input: { create: { width: NIM_BOX.width, height: NIM_BOX.height, channels: 3, background: '#1f2937' } }, left: NIM_BOX.left, top: NIM_BOX.top },
    { input: strip(PD.width, PD.strip), left: 0, top: PD.height - PD.strip },
  ])
  .png()
  .toFile('public/img/bukti-pddikti.png');

// 2) UNESCO comment thread without the joking last reply (the third comment starts near y 680), cropped to 736x650.
//    The last "Like · Reply" row ends near y 622; the strip covers the blank bottom 22 px.
const UN = { width: 736, height: 650, strip: 22 };
const unesco = await sharp('public/img/c12247bf79a3a6fc7539c591.jpg')
  .extract({ left: 0, top: 0, width: UN.width, height: UN.height })
  .png()
  .toBuffer();
await sharp(unesco)
  .composite([{ input: strip(UN.width, UN.strip), left: 0, top: UN.height - UN.strip }])
  .png()
  .toFile('public/img/bukti-utas-unesco.png');

console.log('bukti images written');

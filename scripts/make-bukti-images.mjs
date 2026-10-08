import sharp from 'sharp';

// One-off: derive the two images the Bukti page needs from the originals in public/img.
// 1) PDDikti record with the NIM value covered by a solid box.
const NIM_BOX = { left: 120, top: 915, width: 350, height: 75 };
await sharp('public/img/e5e6eb087c371f40b7a5f231.png')
  .composite([{
    input: { create: { width: NIM_BOX.width, height: NIM_BOX.height, channels: 3, background: '#1f2937' } },
    left: NIM_BOX.left, top: NIM_BOX.top,
  }])
  .png()
  .toFile('public/img/bukti-pddikti.png');

// 2) UNESCO comment thread without the joking last reply (the third comment starts near y 680).
await sharp('public/img/c12247bf79a3a6fc7539c591.jpg')
  .extract({ left: 0, top: 0, width: 736, height: 650 })
  .png()
  .toFile('public/img/bukti-utas-unesco.png');

console.log('bukti images written');

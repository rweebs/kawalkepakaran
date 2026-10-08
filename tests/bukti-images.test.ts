import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

// NIM value line on the 1206x1781 PDDikti screenshot: x 133-443, y 928-978; the "NIM" label sits above y 900.
const NIM_BOX = { left: 120, top: 915, width: 350, height: 75 };

describe('derived bukti images', () => {
  it('covers the NIM value with one solid colour and leaves the rest of the image intact', async () => {
    const out = 'public/img/bukti-pddikti.png';
    const orig = 'public/img/e5e6eb087c371f40b7a5f231.png';
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1206, 1781]);

    const box = await sharp(out).extract(NIM_BOX).removeAlpha().raw().toBuffer();
    const first = [box[0], box[1], box[2]];
    for (let i = 0; i < box.length; i += 3) expect([box[i], box[i + 1], box[i + 2]]).toEqual(first);

    const origBox = await sharp(orig).extract(NIM_BOX).removeAlpha().raw().toBuffer();
    expect(Buffer.compare(box, origBox)).not.toBe(0);

    // a strip above the box (the "NIM" label and the line before it) is unchanged
    const strip = { left: 0, top: 700, width: 1206, height: 200 };
    const a = await sharp(out).extract(strip).removeAlpha().raw().toBuffer();
    const b = await sharp(orig).extract(strip).removeAlpha().raw().toBuffer();
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it('crops the UNESCO thread above the third comment', async () => {
    const meta = await sharp('public/img/bukti-utas-unesco.png').metadata();
    expect([meta.width, meta.height]).toEqual([736, 650]);
  });
});

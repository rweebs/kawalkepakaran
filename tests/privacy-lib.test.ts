import { describe, it, expect } from 'vitest';
import { findPersonalData } from '../src/lib/privacy';

const ALLOWED = new Set(['abil@assai.id']);
const found = (t: string) => findPersonalData(t, ALLOWED);

describe('findPersonalData', () => {
  it.each([
    '+62 851-5505-2271', '62 812 3456 7890', '6281234567890', '0812.3456.7890',
    '(021) 555-1234', '+62-21-5551234',
  ])('flags phone %s', (p) => expect(found(`Hubungi ${p} segera`).length).toBeGreaterThan(0));

  it.each(['3174012345678901', '3174 0123 4567 8901', '3174-0123-4567-8901'])('flags NIK %s', (n) =>
    expect(found(`NIK ${n}`).length).toBeGreaterThan(0));

  it('flags an unapproved email', () => expect(found('x@y.com').length).toBeGreaterThan(0));
  it('flags an obfuscated email', () => expect(found('x [at] y.com').length).toBeGreaterThan(0));
  it('allows an approved email, even before a full stop', () => expect(found('Kirim ke abil@assai.id.')).toEqual([]));
  it('does not flag the digits inside an image file name or link', () => {
    expect(found('![](4ac1234567890123456721e3784.png) and ![x](/img/the-shadow-1234567890123464d29a863210aa0f.png)')).toEqual([]);
  });
  it('does not flag npm package versions that look like an email', () => {
    expect(found('firebase@9.6.11 and react-scripts@5.0.1 and @scope/pkg@1.2.3')).toEqual([]);
  });
  it('still flags a real phone number and a real email next to an image', () => {
    expect(found('![](img.png) call 0812 3456 7890 or write to someone@example.com').length).toBe(2);
  });
  it('does not flag ordinary numbers and dates', () => {
    expect(found('Pada 2026-05-02 ada 6.000 serangan dan 1.685 LOC, filing JID2026040529, PDF 12917–13531.')).toEqual([]);
  });
});

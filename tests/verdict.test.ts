import { describe, it, expect } from 'vitest';
import { verdictLabel, credentialLabel, confidenceLabel, replyStatusLabel } from '../src/lib/verdict';

describe('verdictLabel', () => {
  it('labels all four verdicts in both languages', () => {
    expect(verdictLabel('dikonfirmasi', 'id')).toBe('Dikonfirmasi');
    expect(verdictLabel('sebagian', 'id')).toBe('Sebagian');
    expect(verdictLabel('tidak-terbukti', 'id')).toBe('Tidak terbukti');
    expect(verdictLabel('belum-terverifikasi', 'id')).toBe('Belum bisa diverifikasi');
    expect(verdictLabel('dikonfirmasi', 'en')).toBe('Confirmed');
    expect(verdictLabel('sebagian', 'en')).toBe('Partly');
    expect(verdictLabel('tidak-terbukti', 'en')).toBe('Not supported');
    expect(verdictLabel('belum-terverifikasi', 'en')).toBe('Cannot yet be verified');
  });
});

describe('other labels', () => {
  it('labels credential status, confidence and reply status in both languages', () => {
    expect(credentialLabel('belum-diperiksa', 'id')).toBe('Belum diperiksa');
    expect(credentialLabel('terverifikasi', 'en')).toBe('Verified');
    expect(confidenceLabel('rendah', 'id')).toBe('Rendah');
    expect(confidenceLabel('tinggi', 'en')).toBe('High');
    expect(replyStatusLabel('belum-ada', 'id')).toBe('Belum ada tanggapan');
    expect(replyStatusLabel('dipublikasikan', 'en')).toBe('Reply published');
  });
});

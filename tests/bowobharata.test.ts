import { describe, it, expect } from 'vitest';
import { EVENTS } from '../src/lib/linimasa';
import { FRAMING, PAGE, PARVAS, POSTERS, parvaEvents } from '../src/lib/bowobharata';

describe('bowobharata content', () => {
  it('has eight numbered parvas with unique kebab-case ids and text', () => {
    expect(PARVAS).toHaveLength(8);
    expect(PARVAS.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(PARVAS.map((p) => p.id)).size).toBe(8);
    for (const p of PARVAS) {
      expect(p.id, p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.title.length, p.id).toBeGreaterThan(0);
      expect(p.episode.length, p.id).toBeGreaterThan(0);
      expect(p.paragraphs.length, p.id).toBeGreaterThan(0);
    }
  });
  it('maps every linimasa event to exactly one parva, so a new or removed event fails here', () => {
    const mapped = PARVAS.flatMap((p) => p.slugs);
    expect(new Set(mapped).size, 'a slug is used twice').toBe(mapped.length);
    expect([...mapped].sort()).toEqual(EVENTS.map((e) => e.slug).sort());
  });
  it('resolves each parva to real events in chronological order', () => {
    for (const p of PARVAS) {
      const events = parvaEvents(p);
      expect(events, p.id).toHaveLength(p.slugs.length);
      const dates = events.map((e) => e.date);
      expect([...dates].sort(), p.id).toEqual(dates);
    }
  });
  it('labels the page as allegory, opinion and AI art, and never as a finding', () => {
    const text = FRAMING.join(' ');
    expect(text).toMatch(/kiasan/i);
    expect(text).toMatch(/pendapat/i);
    expect(text).toMatch(/AI/);
    expect(text).toMatch(/hak jawab/i);
    expect(text).not.toMatch(/terbukti bersalah|putusan pengadilan/i);
  });
  it('describes the three posters with alt text', () => {
    expect(Object.keys(POSTERS).sort()).toEqual(['krishna', 'sengkuni', 'wide']);
    for (const p of Object.values(POSTERS)) expect(p.alt.length).toBeGreaterThan(20);
  });
  it('has a page title and a description under 160 characters', () => {
    expect(PAGE.title).toBe('Bowobharata: Rahmat Wibowo vs Abil Sudarman');
    expect(PAGE.description.length).toBeLessThanOrEqual(160);
  });
});

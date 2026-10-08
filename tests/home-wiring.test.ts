import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOME_SECTIONS } from '../src/lib/sky/states';

const home = readFileSync('src/pages/index.astro', 'utf8');

describe('home', () => {
  it('leads with the pakar framing and links the main sections', () => {
    for (const k of ["routePath('experts'", "routePath('claims'", "routePath('method'", "routePath('caseHome'"]) expect(home).toContain(k);
  });
  it('no longer presents Operasi Ababil as the site identity', () => {
    expect(home).not.toMatch(/Operasi Ababil|Operation Ababil/);
  });
  it('keeps every section id the sky animation observes, plus the contribution anchor the menu links to', () => {
    for (const id of HOME_SECTIONS) expect(home, id).toContain(`id="${id}"`);
    expect(home).toContain('id="kontribusi"');
  });
  it('links the contribution guide on the default branch', () => {
    expect(home).toContain('blob/main/CONTRIBUTING.md');
    expect(home).not.toContain('blob/master');
  });
});

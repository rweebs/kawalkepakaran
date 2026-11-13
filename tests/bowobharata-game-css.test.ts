import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles/bowobharata-game.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule { selector: string; body: string }
/** Every `selector { body }` block, including the ones nested in @media. */
const rules: Rule[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim().replace(/\s+/g, ' '),
  body: m[2].trim().replace(/\s+/g, ' '),
}));

/** Bodies of every rule whose selector list contains `sel` exactly. */
function bodies(sel: string): string[] {
  return rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel)).map((r) => r.body);
}
function has(sel: string, decl: string): boolean {
  return bodies(sel).some((b) => b.split(';').map((d) => d.trim().replace(/\s*:\s*/, ': ')).includes(decl));
}
function declared(sel: string, prop: string): string[] {
  return bodies(sel).flatMap((b) => b.split(';').map((d) => d.trim()).filter((d) => d.startsWith(`${prop}:`)).map((d) => d.slice(prop.length + 1).trim()));
}

/** Every time value in a declaration value, in seconds. */
function durations(v: string): number[] {
  return [...v.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((t) => (t[2] === 'ms' ? Number(t[1]) / 1000 : Number(t[1])));
}

describe('bowobharata-game.css stage and HUD', () => {
  it('fixes the stage height', () => {
    const s = ".bg-game[data-mode='3d']:not([data-screen='gate'])";
    expect(has(s, 'height: min(100svh, 56rem)')).toBe(true);
    expect(has(s, 'grid-template-rows: minmax(0, 1fr)')).toBe(true);
    expect(declared(s, 'min-height')).toEqual([]);
  });

  it('scrolls reading screens inside the stage', () => {
    const s = ".bg-game[data-mode='3d'] .bg-screen";
    for (const d of ['min-height: 0', 'max-height: 100%', 'overflow-y: auto', 'align-self: start']) expect(has(s, d)).toBe(true);
  });

  it('does not stretch buttons (F4)', () => {
    expect(has('.bg-screen', 'align-content: start')).toBe(true);
    expect(has('.bg-actions', 'align-items: flex-start')).toBe(true);
    expect(has('.bg-game .btn', 'align-self: flex-start')).toBe(true);
  });

  it('anchors the HUD to the stage corners (F5)', () => {
    for (const d of ['position: absolute', 'inset: 0', 'pointer-events: none', 'z-index: 1']) expect(has('.bg-hud', d)).toBe(true);
    expect(has('.bg-hud button', 'pointer-events: auto')).toBe(true);
    expect(declared('.bg-hud', 'background').filter((v) => v !== 'none' && v !== 'transparent')).toEqual([]);
    for (const p of ['margin', 'padding', 'border-radius', 'display', 'flex']) expect(declared('.bg-hud', p)).toEqual([]);
    expect(declared('.bg-hud', 'position')).toEqual(['absolute']);
    const hudRelative = rules.filter((r) => r.selector.split(',').map((x) => x.trim()).includes('.bg-hud') && /(^|;\s*)position:\s*relative/.test(r.body));
    expect(hudRelative).toEqual([]);
    expect(css).not.toMatch(/\.bg-hud\s*\{[^}]*margin/);
    expect(has('.bg-objective', 'top: 0.75rem') && has('.bg-objective', 'left: 0.75rem')).toBe(true);
    expect(has('.bg-objective', 'max-width: min(22rem, 46%)')).toBe(true);
    expect(has('.bg-radar-slot', 'top: 0.75rem') && has('.bg-radar-slot', 'right: 0.75rem')).toBe(true);
    expect(has('.bg-gauges', 'bottom: 0.75rem') && has('.bg-gauges', 'right: 0.75rem')).toBe(true);
    expect(has('.bg-toasts', 'bottom: 0.75rem') && has('.bg-toasts', 'left: 0.75rem')).toBe(true);
    expect(bodies(".bg-hud[data-touch] .bg-toasts").length).toBeGreaterThan(0);
    expect(declared(".bg-hud[data-touch] .bg-toasts", 'bottom')).toEqual(['auto']);
  });

  it('keeps the hint line muted', () => {
    expect(has('.bg-hint', 'color: var(--text-secondary)')).toBe(true);
    expect(declared('.bg-hint', 'background').filter((v) => v !== 'none' && v !== 'transparent')).toEqual([]);
    expect(declared('.bg-hint', 'border')).toEqual([]);
    expect(css).not.toMatch(/kbd/);
  });

  it('makes the play surface touch-safe', () => {
    expect(has(".bg-stage[data-play='on']", 'touch-action: none')).toBe(true);
  });

  it('has the intro cinema', () => {
    expect(css).toMatch(/\.bg-stage\[data-cine='on'\]/);
    expect(css).toContain('8%');
    expect(has('.bg-mission', 'position: absolute')).toBe(true);
    expect(has('.bg-mission', 'left: 0.75rem')).toBe(true);
    expect(declared('.bg-wipe', 'pointer-events')).toEqual(['none']);
    const inV = declared(".bg-stage[data-wipe='in'] .bg-wipe", 'clip-path');
    const outV = declared(".bg-stage[data-wipe='out'] .bg-wipe", 'clip-path');
    expect(inV).toHaveLength(1);
    expect(outV).toHaveLength(1);
    expect(inV[0]).not.toEqual(outV[0]);
    const tr = declared('.bg-wipe', 'transition').filter((v) => v !== 'none');
    expect(tr).toHaveLength(1);
    expect(tr[0]).toMatch(/^clip-path /);
    expect(durations(tr[0]).every((d) => d >= 0.5)).toBe(true);
  });

  it('stacks the pause panel above the letterbox bars, the lakon card and the wipe, so a pause during an intro shows it whole', () => {
    const z = (sel: string) => {
      const v = declared(sel, 'z-index');
      expect(v, sel).toHaveLength(1);
      return Number(v[0]);
    };
    const paused = z('.bg-paused');
    for (const sel of [".bg-stage[data-cine='on']::before", ".bg-stage[data-cine='on']::after", '.bg-mission', '.bg-wipe', '.bg-hud']) {
      expect(paused, sel).toBeGreaterThan(z(sel));
    }
  });

  it('uses only the site fonts and no @font-face', () => {
    expect(css).not.toContain('@font-face');
    const fams = [...css.matchAll(/font-family:\s*([^;}]+)/g)].map((m) => m[1].trim());
    for (const f of fams) expect(['inherit', 'var(--font)', 'var(--font-display)', 'var(--mono)']).toContain(f);
  });

  it('turns motion off for reduced motion, wipe included', () => {
    const m = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('.bg-game *');
    expect(m![1]).toContain('animation: none');
    expect(m![1]).toMatch(/\.bg-wipe[^{]*\{[^}]*display: none[^}]*clip-path: none[^}]*transition: none/);
  });

  it('has no animation or transition shorter than 0.5s', () => {
    const decls = [...css.matchAll(/(animation|animation-duration|transition|transition-duration):\s*([^;}]+)/g)];
    expect(decls.length).toBeGreaterThan(0);
    for (const [, , value] of decls) {
      if (/^(none|0s)(\s*!important)?$/.test(value.trim())) continue;
      for (const t of durations(value)) expect(t).toBeGreaterThanOrEqual(0.5);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Perkara } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { gameData } from '../src/lib/bowobharata-game/data-build';
import { RADAR_PX } from '../src/lib/bowobharata-game/radar';

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

// ── Media-aware lookups and a small layout model, for the touch HUD (Task 34) ──────────────────────────────────────────

/** The end of the block whose `{` is the first one at or after `at`. */
function blockEnd(at: number): { open: number; end: number } {
  const open = css.indexOf('{', at);
  let i = open + 1;
  for (let depth = 1; depth > 0; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return { open, end: i };
}
/** The text of every `@media <query> { … }` block, joined. */
function media(query: string): string {
  let out = '';
  for (let at = css.indexOf(`@media ${query}`); at !== -1; at = css.indexOf(`@media ${query}`, at + 1)) {
    const { open, end } = blockEnd(at);
    out += `${css.slice(open + 1, end - 1)}\n`;
  }
  return out;
}
/** The CSS outside every @media block. */
const base = (() => {
  let out = '';
  let i = 0;
  for (let at = css.indexOf('@media'); at !== -1; at = css.indexOf('@media', i)) {
    out += css.slice(i, at);
    i = blockEnd(at).end;
  }
  return out + css.slice(i);
})();
/** The last value `prop` takes in the rules of `text` whose selector list holds `sel`. */
function within(text: string, sel: string, prop: string): string | undefined {
  let v: string | undefined;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')).includes(sel)) continue;
    for (const d of m[2].split(';')) {
      const k = d.indexOf(':');
      if (k > 0 && d.slice(0, k).trim() === prop) v = d.slice(k + 1).trim().replace(/\s+/g, ' ');
    }
  }
  return v;
}
/** A CSS length in px: px, rem (16 px) and % (of `of`), joined by + and -, inside calc() and min(). */
function px(v: string, of: number): number {
  const s = v.replace(/\s+/g, '');
  let i = 0;
  const term = (): number => {
    for (const fn of ['calc(', 'min('] as const) {
      if (!s.startsWith(fn, i)) continue;
      i += fn.length;
      const xs = [sum()];
      while (s[i] === ',') {
        i++;
        xs.push(sum());
      }
      i++;
      return fn === 'min(' ? Math.min(...xs) : xs[0];
    }
    const m = /^(\d*\.?\d+)(px|rem|%)?/.exec(s.slice(i));
    if (!m) throw new Error(`not a length: ${v}`);
    i += m[0].length;
    const n = Number(m[1]);
    return m[2] === 'rem' ? n * 16 : m[2] === '%' ? (n / 100) * of : n;
  };
  const sum = (): number => {
    let x = term();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++];
      const y = term();
      x = op === '+' ? x + y : x - y;
    }
    return x;
  };
  const out = sum();
  if (i !== s.length) throw new Error(`not a length: ${v}`);
  return out;
}
/** Every @media block, in source order: its condition and its text. */
const MEDIA = (() => {
  const out: { cond: string; text: string }[] = [];
  for (let at = css.indexOf('@media'); at !== -1; at = css.indexOf('@media', blockEnd(at).end)) {
    const { open, end } = blockEnd(at);
    out.push({ cond: css.slice(at + '@media'.length, open).trim(), text: css.slice(open + 1, end - 1) });
  }
  return out;
})();
/** Whether a media condition holds on a vw × vh screen: max-width and max-height in px, joined by `and`. Any other
 * feature (reduced motion, say) does not hold. */
function holds(cond: string, vw: number, vh: number): boolean {
  return cond.split(/\s+and\s+/).every((f) => {
    const m = /^\((max-width|max-height):\s*(\d+)px\)$/.exec(f.trim());
    return m !== null && (m[1] === 'max-width' ? vw : vh) <= Number(m[2]);
  });
}
/**
 * The value of `prop` for an element that `sels` match, least specific first, on a vw × vh viewport: the most specific
 * selector that sets it wins, and among its rules the last block that applies (the base, then each @media block that
 * holds, in source order). Undefined when nothing sets it.
 */
function maybeValueOf(sels: readonly string[], prop: string, vw: number, vh: number): string | undefined {
  const blocks = [base, ...MEDIA.filter((b) => holds(b.cond, vw, vh)).map((b) => b.text)];
  for (const sel of [...sels].reverse()) {
    let v: string | undefined;
    for (const b of blocks) v = within(b, sel, prop) ?? v;
    if (v !== undefined) return v;
  }
  return undefined;
}
function valueOf(sels: readonly string[], prop: string, vw: number, vh: number): string {
  const v = maybeValueOf(sels, prop, vw, vh);
  if (v === undefined) throw new Error(`${sels.join(' / ')}: no ${prop}`);
  return v;
}
interface Box { left: number; top: number; right: number; bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** The phones the touch HUD must fit (Task 34's ruling), portrait then landscape: vw × vh. */
const PHONES = [[360, 780], [360, 640], [375, 667], [780, 360], [640, 360], [667, 375]] as const;
/** The stage on each phone. In the page: the container's width (100% − 2rem) and the height under the site header
 * (100svh − 59 px). In full screen: the whole screen. vw × vh is the viewport the media queries see. */
const STAGES = PHONES.flatMap(([vw, vh]) => [
  { name: `${vw}×${vh} in the page`, vw, vh, w: vw - 32, h: vh - 59 },
  { name: `${vw}×${vh} in full screen`, vw, vh, w: vw, h: vh },
]);
type Stage = (typeof STAGES)[number];
const BUTTONS = ['rem', 'surge', 'mata', 'ride'] as const;
/** The buttons' column, from the stage's right edge (px): Laju's left edge, 108 + 60. */
const CLUSTER = Math.max(...BUTTONS.map((k) => parseFloat(declared(`.bg-touch__btn--${k}`, 'right')[0]) + parseFloat(declared(`.bg-touch__btn--${k}`, 'width')[0])));
/** The speed pill under the radar: the slot's gap, one line at 1.4 and its padding. */
const PILL = 0.35 * 16 + 16 * 1.4 + 2 * 0.15 * 16;

// The toasts' height model. Every toast the game can show, in both languages: each record's toast with its card's real
// date and channel at its chapter's largest count, the prologue's count, the fixed lines and the lap lines.
const GAME = gameData(JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara);
const TOAST_TEXTS = (['id', 'en'] as const).flatMap((l) => {
  const t = GAME_COPY[l].toasts;
  return [
    ...GAME.events.flatMap((cards) => cards.map((c) => t.recorded({ n: cards.length, total: cards.length, date: c.dateLabel[l], channel: c.channel[l] }))),
    t.recordedPrologue({ n: 8, total: 8 }), t.filed, t.rewrite, t.ranks, t.checkpoint, t.wall, t.gate, t.letter,
    t.lap({ n: 5, seconds: 188.8, matched: false }), t.lap({ n: 5, seconds: 188.8, matched: true }),
  ];
});
/**
 * A glyph's mean width in em. Measured in headless Chrome (system-ui) for every real toast at the touch columns of these
 * phones, 0.52 never gives fewer lines than the browser, and at most one more.
 */
const GLYPH_EM = 0.52;
/** The lines a text takes at `width` px, words wrapped greedily, each character `glyph` px wide. */
function linesOf(text: string, width: number, glyph: number): number {
  const per = Math.max(1, Math.floor(width / glyph));
  let lines = 1;
  let len = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const need = len === 0 ? word.length : len + 1 + word.length;
    if (need <= per) len = need;
    else {
      lines += len === 0 ? 0 : 1;
      lines += Math.ceil(word.length / per) - 1;
      len = word.length % per || per;
    }
  }
  return lines;
}
/** The height (px) of the tallest real toast in a column `width` px wide, on a vw × vh viewport. */
function toastHeight(width: number, vw: number, vh: number): number {
  const sels = ['.bg-toast', '.bg-hud[data-touch] .bg-toast'];
  const font = px(valueOf(sels, 'font-size', vw, vh), 16);
  const lineHeight = Number(maybeValueOf(sels, 'line-height', vw, vh) ?? '1.65');
  const [padY, padX] = valueOf(sels, 'padding', vw, vh).split(' ').map((p) => px(p, 0));
  const lines = Math.max(...TOAST_TEXTS.map((t) => linesOf(t, width - 2 * padX, GLYPH_EM * font)));
  return lines * font * lineHeight + 2 * padY;
}
/** Where the touch HUD's parts and the touch controls lie on a stage, in px from its top left. */
function lay(s: Stage) {
  const v = (sels: readonly string[], prop: string) => valueOf(sels, prop, s.vw, s.vh);
  const objSels = ['.bg-objective', '.bg-hud[data-touch] .bg-objective'];
  const objectiveRight = px(v(objSels, 'left'), s.w) + px(v(objSels, 'max-width'), s.w);
  const slotSels = ['.bg-radar-slot', '.bg-hud[data-touch] .bg-radar-slot'];
  const slotRight = s.w - px(v(slotSels, 'right'), s.w);
  const slotTop = px(v(slotSels, 'top'), s.h);
  const slot: Box = { left: slotRight - RADAR_PX, right: slotRight, top: slotTop, bottom: slotTop + RADAR_PX + PILL };
  const toastSels = ['.bg-toasts', '.bg-hud[data-touch] .bg-toasts'];
  const toastsRight = s.w - px(v(toastSels, 'right'), s.w);
  const toastsTop = px(v(toastSels, 'top'), s.h);
  const column = px(v(toastSels, 'max-width'), s.w);
  const toastH = toastHeight(column, s.vw, s.vh);
  const gap = px(v(['.bg-toasts'], 'gap'), 0);
  // Where the CSS hides the older toasts, only the newest shows.
  const newestOnly = maybeValueOf(['.bg-hud[data-touch] .bg-toast:not(:last-child)'], 'display', s.vw, s.vh) === 'none';
  const shown = newestOnly ? 1 : 2;
  const toasts: Box = { left: toastsRight - column, right: toastsRight, top: toastsTop, bottom: toastsTop + shown * toastH + (shown - 1) * gap };
  const buttons = Object.fromEntries(BUTTONS.map((k): [string, Box] => {
    const sel = `.bg-touch__btn--${k}`;
    const right = s.w - parseFloat(declared(sel, 'right')[0]);
    const bottom = s.h - parseFloat(declared(sel, 'bottom')[0]);
    const size = parseFloat(declared(sel, 'width')[0]);
    return [k, { left: right - size, right, top: bottom - size, bottom }];
  }));
  const steer: Box = { left: 0, right: px(declared('.bg-touch__steer', 'width')[0], s.w), top: s.h - px(declared('.bg-touch__steer', 'height')[0], s.h), bottom: s.h };
  return { objectiveRight, slot, toasts, toastH, gap, newestOnly, buttons, steer };
}

describe('bowobharata-game.css stage and HUD', () => {
  it('fixes the stage height', () => {
    const s = ".bg-game[data-mode='3d']:not([data-screen='gate'])";
    // Amends spec call 22 (ruled in Task 26b): the stage is as tall as the area under the site header, capped at 56rem.
    expect(has(s, 'height: min(calc(100svh - var(--nav-h, 59px)), 56rem)')).toBe(true);
    expect(has('.bg-stage', 'scroll-margin-top: var(--nav-h, 59px)')).toBe(true);
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
    // One animation per transition, started by one attribute change: 'a' and 'b' run the same keyframes under two names so
    // that every transition restarts it. Cover (0.3 s), a 0.15 s hold, then open (0.45 s): 0.9 s.
    const closed = declared('.bg-wipe', 'clip-path').filter((v) => v !== 'none');
    expect(closed).toEqual(['polygon(50% 0, 50% 0, 50% 0, 50% 0, 50% 0)']);
    for (const v of ['a', 'b']) {
      const an = declared(`.bg-stage[data-wipe='${v}'] .bg-wipe`, 'animation');
      expect(an, v).toHaveLength(1);
      expect(durations(an[0])[0]).toBeCloseTo(0.9, 5);
    }
    expect(declared('.bg-wipe', 'transition').filter((v) => v !== 'none')).toEqual([]);
    const names = ['a', 'b'].map((v) => declared(`.bg-stage[data-wipe='${v}'] .bg-wipe`, 'animation')[0].split(' ')[0]);
    expect(names[0]).not.toEqual(names[1]);
    for (const n of names) {
      const kf = css.match(new RegExp(`@keyframes ${n}\\s*\\{([\\s\\S]*?\\})\\s*\\}`));
      expect(kf, n).not.toBeNull();
      expect(kf![1]).toMatch(/33\.3%, 50%\s*\{\s*clip-path: polygon\(50% 0, 100% 0, 100% 100%, 0 100%, 0 0\)/);
      expect(kf![1]).toMatch(/0%[^}]*polygon\(50% 0, 50% 0/);
      expect(kf![1]).toMatch(/100%[^}]*polygon\(50% 0, 50% 0/);
    }
  });

  it('hides the site theme-song control while a chapter is driven, never removing it, so the song keeps playing', () => {
    const rule = rules.find((r) => r.selector.includes("data-play='on'") && r.selector.includes('.theme-song'));
    expect(rule).toBeDefined();
    expect(rule!.selector).toContain(':not([data-paused])');
    expect(rule!.selector).toContain(':is(.theme-song, .theme-song__toggle, .theme-song__panel)');
    expect(rule!.body).toContain('visibility: hidden');
    expect(rule!.body).toContain('pointer-events: none');
    expect(css).not.toMatch(/\.theme-song[^{]*\{[^}]*display: none/);
  });

  it('leaves the still screens room to scroll their last control clear of the fixed song pill', () => {
    expect(declared(".bg-game[data-mode='3d'] .bg-screen", 'padding-bottom')).toEqual([]);
    const pad = rules.find((r) => r.selector.startsWith(".bg-game[data-mode='3d'] :is(") && /padding-bottom: 4\.5rem/.test(r.body));
    expect(pad).toBeDefined();
    for (const c of ['bg-recorded', 'bg-sanjaya', 'bg-fail', 'bg-paused', 'bg-error', 'bg-slow', 'bg-finale']) expect(pad!.selector).toContain(`.${c}`);
    for (const c of ['bg-mission', 'bg-gate', 'bg-intro']) expect(pad!.selector).not.toContain(`.${c}`);
    for (const c of ['.bg-mission', '.bg-gate', '.bg-intro']) expect(declared(c, 'padding-bottom')).toEqual([]);
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

  it('sizes and anchors the touch controls', () => {
    for (const b of ['.bg-touch__btn']) {
      for (const p of ['min-width', 'min-height']) expect(parseFloat(declared(b, p)[0]), `${b} ${p}`).toBeGreaterThanOrEqual(56);
    }
    const anchors = { rem: [24, 24, 72], surge: [108, 40, 60], mata: [40, 112, 60], ride: [24, 184, 80] } as const;
    for (const [k, [right, bottom, size]] of Object.entries(anchors)) {
      const sel = `.bg-touch__btn--${k}`;
      expect(declared(sel, 'right'), sel).toEqual([`${right}px`]);
      expect(declared(sel, 'bottom'), sel).toEqual([`${bottom}px`]);
      expect(parseFloat(declared(sel, 'width')[0]), sel).toBeGreaterThanOrEqual(56);
      expect(declared(sel, 'width'), sel).toEqual([`${size}px`]);
    }
    expect(declared('.bg-touch__steer', 'left')).toEqual(['0']);
    expect(declared('.bg-touch__steer', 'bottom')).toEqual(['0']);
    expect(declared('.bg-touch__steer', 'height')).toEqual(['55%']);
    expect(declared('.bg-touch__steer', 'width')).toEqual(['46%']);
    expect(declared('.bg-touch__steer', 'touch-action')).toEqual(['none']);
    expect(declared('.bg-touch__capsule', 'width')).toEqual(['140px']);
    expect(declared('.bg-touch__capsule', 'height')).toEqual(['56px']);
  });

  it('on touch: the radar at top right with the speed under it, then the toasts below them in the right column (Task 34)', () => {
    const slot = '.bg-radar-slot';
    // The slot stacks the radar and, on touch, the speed pill under it.
    for (const d of ['display: grid', 'justify-items: center']) expect(has(slot, d), d).toBe(true);
    expect(bodies('.bg-radar-slot .bg-speed').length).toBe(1);
    // No gauges panel on touch any more: the buttons carry the rings and the speed moved under the radar.
    expect(rules.filter((r) => r.selector.includes('[data-touch] .bg-gauges'))).toEqual([]);
    // The toasts start under the radar's square and the speed pill, whatever the inset, in a smaller type on touch.
    const t = '.bg-hud[data-touch] .bg-toasts';
    expect(within(base, t, 'top')).toBe(`calc(0.75rem + ${RADAR_PX}px + 2.5rem)`);
    expect(within(base, t, 'bottom')).toBe('auto');
    expect(within(base, t, 'left')).toBe('auto');
    expect(within(base, t, 'right')).toBe('0.75rem');
    expect(within(base, t, 'max-width')).toBe('min(22rem, calc(54% - 2rem))');
    const toast = '.bg-hud[data-touch] .bg-toast';
    expect([within(base, toast, 'font-size'), within(base, toast, 'line-height'), within(base, toast, 'padding')]).toEqual(['0.8rem', '1.45', '0.3rem 0.55rem']);
    const narrow = media('(max-width: 480px)');
    expect(within(narrow, t, 'top')).toBe(`calc(0.5rem + ${RADAR_PX}px + 2.5rem)`);
    expect(within(narrow, t, 'right')).toBe('0.5rem');
    expect(within(narrow, t, 'max-width')).toBe('min(22rem, calc(54% - 1.5rem))');
    // A short stage (a phone on its side): the objective panel narrows to 40%, and the radar and the toasts sit just
    // left of the buttons' column.
    const short = media('(max-height: 520px)');
    expect(within(short, '.bg-hud[data-touch] .bg-objective', 'max-width')).toBe('min(22rem, 40%)');
    expect(within(short, '.bg-hud[data-touch] .bg-radar-slot', 'right')).toBe(`calc(${CLUSTER}px + 0.5rem)`);
    expect(within(short, t, 'right')).toBe(`calc(${CLUSTER}px + 0.5rem)`);
    expect(within(short, t, 'max-width')).toBe(`calc(54% - ${CLUSTER}px - 1rem)`);
  });

  it('at every listed phone, in the page and in full screen, the radar, its speed and the toasts fit and clear every button, the steer zone and the objective panel', () => {
    expect(STAGES).toHaveLength(12);
    for (const s of STAGES) {
      const L = lay(s);
      const where = `${s.name}`;
      // The radar slot with the speed pill under it, then the toasts, within the stage. No clamp: the toasts end
      // inside it, at the model's height (the tallest real toast at the column's width).
      expect(L.slot.left, where).toBeGreaterThanOrEqual(0);
      expect(L.slot.right, where).toBeLessThanOrEqual(s.w);
      expect(L.slot.bottom, where).toBeLessThanOrEqual(s.h);
      expect(L.toasts.top, where).toBeGreaterThanOrEqual(L.slot.bottom + 4);
      expect(L.toasts.bottom, where).toBeLessThanOrEqual(s.h - 8);
      // Clear of the objective panel at its widest (its height depends on its lines, so the columns must not meet).
      expect(L.slot.left, where).toBeGreaterThanOrEqual(L.objectiveRight + 8);
      expect(L.toasts.left, where).toBeGreaterThanOrEqual(L.objectiveRight + 8);
      // Clear of every button, Maju included (shown with easy control off), and of the steer zone.
      for (const [name, b] of Object.entries(L.buttons)) {
        expect(overlaps(L.slot, b), `${where}: radar and ${name}`).toBe(false);
        expect(overlaps(L.toasts, b), `${where}: toasts and ${name}`).toBe(false);
      }
      expect(overlaps(L.slot, L.steer), `${where}: radar and steer`).toBe(false);
      expect(overlaps(L.toasts, L.steer), `${where}: toasts and steer`).toBe(false);
      // Where two toasts would not fit above the buttons and inside the stage, only the newest shows.
      const below = Object.values(L.buttons).filter((b) => b.left < L.toasts.right && L.toasts.left < b.right).map((b) => b.top);
      const room = Math.min(s.h, ...below) - 8 - L.toasts.top;
      if (2 * L.toastH + L.gap > room) expect(L.newestOnly, `${where}: two toasts need ${2 * L.toastH + L.gap} of ${room} px`).toBe(true);
    }
    // Upright, the radar keeps the top right corner, and the toasts end above Mata's and Maju's tops.
    for (const s of STAGES.filter((x) => x.vh > x.vw)) {
      const L = lay(s);
      expect(L.slot.right, s.name).toBeGreaterThanOrEqual(s.w - 12);
      expect(L.toasts.bottom, s.name).toBeLessThanOrEqual(Math.min(L.buttons.mata.top, L.buttons.ride.top) - 8);
    }
    // On a tall phone both toasts still show.
    expect(lay(STAGES[0]).newestOnly).toBe(false);
  });

  it('never hides the newest toast: only older ones are hidden, whole, so the live region still speaks each new one', () => {
    const hiding = rules.filter((r) => r.selector.includes('.bg-toast') && /(^|;\s*)display:\s*none/.test(r.body));
    expect(hiding.length).toBeGreaterThan(0);
    for (const r of hiding) {
      for (const sel of r.selector.split(',').map((x) => x.trim())) expect(sel).toBe('.bg-hud[data-touch] .bg-toast:not(:last-child)');
    }
    // Hidden whole: nothing clips a toast's height or its text.
    for (const sel of ['.bg-toast', '.bg-toasts', '.bg-hud[data-touch] .bg-toast', '.bg-hud[data-touch] .bg-toasts']) {
      for (const p of ['max-height', 'height', 'overflow', 'text-overflow', '-webkit-line-clamp']) expect(declared(sel, p), `${sel} ${p}`).toEqual([]);
    }
  });
});

describe('bowobharata-game.css radar and clamour', () => {
  // Every rule of the radar and the clamour: the slot, the blocks and their elements (.bg-radar__mark, .bg-riuh__fill).
  const radarRules = rules.filter((r) => /\.bg-(?:radar|riuh)/.test(r.selector));
  it('finds the radar\'s rules, its elements included', () => {
    for (const sel of ['.bg-radar-slot', '.bg-radar', '.bg-radar__map', ".bg-radar__mark[data-kind='ranks']", '.bg-riuh', '.bg-riuh__fill']) {
      expect(radarRules.some((r) => r.selector.split(',').map((s) => s.trim()).includes(sel)), sel).toBe(true);
    }
  });

  it('the clamour arc is amber: no .bg-riuh rule, nor any radar rule, uses red or blue', () => {
    const riuh = rules.filter((r) => r.selector.includes('.bg-riuh'));
    expect(riuh.length).toBeGreaterThan(0);
    for (const r of riuh) expect(r.body, r.selector).not.toMatch(/--accent-red|--accent-blue/);
    for (const r of radarRules) expect(r.body, r.selector).not.toMatch(/--accent-red|--accent-blue|--text-accent|\b(?:red|blue)\b/);
    expect(declared('.bg-riuh__fill', 'stroke')).toEqual(['var(--accent-amber)']);
    expect(declared('.bg-riuh__track', 'stroke')).toEqual(['var(--accent-amber)']);
  });

  it('colours the radar from the site tokens only', () => {
    for (const r of radarRules) {
      for (const d of r.body.split(';').map((x) => x.trim()).filter((x) => /^(?:fill|stroke|color):/.test(x))) {
        expect(d, r.selector).toMatch(/:\s*(?:var\(--[a-z-]+\)|none)$/);
      }
    }
  });

  it('lays the clamour under the map in one square, and runs no animation or transition of its own', () => {
    expect(has('.bg-radar', 'position: relative')).toBe(true);
    for (const d of ['position: absolute', 'inset: 0']) expect(has('.bg-riuh', d), d).toBe(true);
    const z = (sel: string) => Number(declared(sel, 'z-index')[0]);
    expect(z('.bg-radar__map')).toBeGreaterThan(z('.bg-riuh'));
    // Its fades and eases run on the frame clock (Radar.tsx), so reduced motion cannot turn them into jumps.
    for (const r of radarRules) expect(r.body, r.selector).not.toMatch(/animation|transition/);
  });
});

describe('bowobharata-game.css chapter reports', () => {
  it('widens Sanjaya and the finale to 64rem for the map and the charts', () => {
    expect(has('.bg-sanjaya', 'max-width: 64rem')).toBe(true);
    expect(has('.bg-finale', 'max-width: 64rem')).toBe(true);
  });

  it('stacks the report block as a grid with a 1rem gap, and fits the charts side by side at 18rem each', () => {
    expect(has('.bg-report', 'display: grid')).toBe(true);
    expect(has('.bg-report', 'gap: 1rem')).toBe(true);
    expect(has('.bg-report__charts', 'display: grid')).toBe(true);
    // 18rem columns, auto-fit; min() lets a single column shrink below 18rem on a 360 px phone instead of overflowing.
    expect(declared('.bg-report__charts', 'grid-template-columns')).toEqual(['repeat(auto-fit, minmax(min(18rem, 100%), 1fr))']);
  });

  it('no horizontal overflow at 360 px: the report and its charts may shrink, and no fixed width is set', () => {
    for (const sel of ['.bg-report', '.bg-report > *', '.bg-report__charts', '.bg-report__charts > *']) expect(has(sel, 'min-width: 0'), sel).toBe(true);
    for (const sel of ['.bg-report', '.bg-report__charts', '.bg-report__stat', '.bg-catch__summary']) {
      expect(declared(sel, 'width'), sel).toEqual([]);
      expect(declared(sel, 'min-width').filter((v) => v !== '0'), sel).toEqual([]);
    }
    expect(has('.bg-screen', 'overflow-wrap: anywhere')).toBe(true);
  });

  it('a map jump to an entry clears the site header and shows its focus', () => {
    expect(has("[id^='bg-entry-']", 'scroll-margin-top: calc(var(--nav-h, 59px) + 0.75rem)')).toBe(true);
    expect(bodies("[id^='bg-entry-']:focus-visible").length).toBe(1);
  });
});


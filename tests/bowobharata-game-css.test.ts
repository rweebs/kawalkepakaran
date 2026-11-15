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

// ── Media- and container-aware lookups, and a layout model of the touch HUD (Task 34) ─────────────────────────────────

/** The end of the block whose `{` is the first one at or after `at`. */
function blockEnd(at: number): { open: number; end: number } {
  const open = css.indexOf('{', at);
  let i = open + 1;
  for (let depth = 1; depth > 0; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
  return { open, end: i };
}
/** Every @media and @container block, in source order: its kind, a container's name, its condition and its text. */
const BLOCKS = (() => {
  const out: { kind: 'media' | 'container'; name: string; cond: string; text: string }[] = [];
  const re = /@(media|container)\b/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const { open, end } = blockEnd(m.index);
    const raw = css.slice(m.index + m[0].length, open).trim();
    const name = m[1] === 'container' ? (/^[a-z][\w-]*(?=\s)/.exec(raw)?.[0] ?? '') : '';
    out.push({ kind: m[1] as 'media' | 'container', name, cond: raw.slice(name.length).trim(), text: css.slice(open + 1, end - 1) });
    re.lastIndex = end;
  }
  return out;
})();
/** The text of every @container block whose condition is exactly `cond`, joined. */
const container = (cond: string) => BLOCKS.filter((b) => b.kind === 'container' && b.cond === cond).map((b) => b.text).join('\n');
/** The CSS outside every @media and @container block. */
const base = (() => {
  let out = '';
  let i = 0;
  const re = /@(media|container)\b/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    out += css.slice(i, m.index);
    i = blockEnd(m.index).end;
    re.lastIndex = i;
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
/** Whether a condition holds for a box of w × h: width and height in px, as min- and max- features or in the range syntax
 * (`width < 342px`), joined by `and`. Any other feature (reduced motion, say) does not hold. */
function holds(cond: string, w: number, h: number): boolean {
  return cond.split(/\s+and\s+/).every((f) => {
    const m = /^\((min|max)-(width|height):\s*(\d+)px\)$/.exec(f.trim());
    if (m) return m[1] === 'max' ? (m[2] === 'width' ? w : h) <= Number(m[3]) : (m[2] === 'width' ? w : h) >= Number(m[3]);
    const r = /^\((width|height)\s*(<=|>=|<|>)\s*(\d+)px\)$/.exec(f.trim());
    if (!r) return false;
    const x = r[1] === 'width' ? w : h;
    const n = Number(r[3]);
    return r[2] === '<' ? x < n : r[2] === '<=' ? x <= n : r[2] === '>' ? x > n : x >= n;
  });
}
interface Stage { name: string; vw: number; vh: number; w: number; h: number }
/**
 * The value of `prop` for an element that `sels` match, least specific first, on a stage: the most specific selector
 * that sets it wins, and among its rules the last block that applies. An @media block holds on the viewport (vw × vh),
 * an @container block on the stage (w × h): the HUD and the touch layer, the two containers, are the stage's size.
 */
function maybeValueOf(sels: readonly string[], prop: string, s: Stage): string | undefined {
  const blocks = [base, ...BLOCKS.filter((b) => (b.kind === 'media' ? holds(b.cond, s.vw, s.vh) : holds(b.cond, s.w, s.h))).map((b) => b.text)];
  for (const sel of [...sels].reverse()) {
    let v: string | undefined;
    for (const b of blocks) v = within(b, sel, prop) ?? v;
    if (v !== undefined) return v;
  }
  return undefined;
}
function valueOf(sels: readonly string[], prop: string, s: Stage): string {
  const v = maybeValueOf(sels, prop, s);
  if (v === undefined) throw new Error(`${sels.join(' / ')}: no ${prop}`);
  return v;
}
interface Box { left: number; top: number; right: number; bottom: number }
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
/** Whether two boxes keep at least `gap` px between them, side by side or one above the other. */
const apart = (a: Box, b: Box, gap: number) => {
  const g = gap - 0.01; // to a hundredth of a px: the CSS lines edges up exactly, and the sums here are floating point
  return !overlaps({ left: a.left - g, top: a.top - g, right: a.right + g, bottom: a.bottom + g }, b);
};

/**
 * The site header on a touch phone, as the island rounds it into --nav-h. Measured in headless Chrome through the
 * DevTools protocol (mobile emulation with touch, DPR 2) on /pantau/bowobharata and /en/monitor/bowobharata, at each
 * width; the larger of the two pages. A coarse pointer makes the language toggle 2.25rem tall, so the header is taller
 * than on a desk (59 px there): 79.4 px at 360-375 (the brand wraps), 68.6 at 640-667, 104.6 at 780-932 (115.4 for
 * the English page at 780, whose menu wraps once more).
 */
const NAV_H: Record<number, number> = { 360: 79, 375: 79, 640: 69, 667: 69, 780: 115, 844: 105, 915: 105, 932: 105 };
/** The phones the touch HUD must fit (Task 34's rulings), upright then on their side: vw × vh. */
const PHONES = [[360, 780], [360, 640], [375, 667], [780, 360], [640, 360], [667, 375], [844, 390], [915, 412], [932, 430]] as const;
/** The stage on each phone. In the page: the container's width (100% − 2rem) and the height under the header,
 * min(100svh − --nav-h, 56rem). In full screen: the whole screen. */
const STAGES: Stage[] = PHONES.flatMap(([vw, vh]) => [
  { name: `${vw}×${vh} in the page`, vw, vh, w: vw - 32, h: Math.min(vh - NAV_H[vw], 896) },
  { name: `${vw}×${vh} in full screen`, vw, vh, w: vw, h: vh },
]);
const BUTTONS = ['rem', 'surge', 'mata', 'ride'] as const;
/** The speed pill under the radar: the slot's gap, one line at 1.4 and its padding. */
const PILL = 0.35 * 16 + 16 * 1.4 + 2 * 0.15 * 16;

/**
 * Glyph advances in em of system-ui (SF on macOS and iOS), measured in headless Chrome at the sizes the HUD uses
 * (12 px frame line, 12.8 px hint and touch toasts, 16 px objective, 16 px at 600 for the buttons): every character the
 * copy uses. A glyph not listed counts 0.65 em.
 */
const GLYPHS: Record<string, Record<string, number>> = {
  '12/400': {"0": 0.6299, "1": 0.4639, "2": 0.6035, "3": 0.627, "4": 0.6435, "5": 0.6182, "6": 0.6367, "7": 0.5884, "8": 0.6387, "9": 0.6367, " ": 0.2813, "%": 0.9253, "'": 0.2969, "(": 0.3818, ")": 0.3818, ",": 0.2969, "-": 0.4717, ".": 0.2969, "/": 0.3047, ":": 0.2969, "A": 0.6738, "B": 0.6572, "C": 0.7158, "D": 0.7266, "E": 0.5957, "F": 0.5723, "G": 0.7466, "H": 0.7422, "I": 0.2676, "J": 0.5381, "K": 0.6587, "L": 0.5679, "M": 0.874, "O": 0.7715, "P": 0.6352, "R": 0.6533, "S": 0.6372, "T": 0.6338, "W": 0.9678, "a": 0.5518, "b": 0.6143, "c": 0.5596, "d": 0.6143, "e": 0.5713, "f": 0.3618, "g": 0.6094, "h": 0.5884, "i": 0.2471, "j": 0.2466, "k": 0.543, "l": 0.2529, "m": 0.8701, "n": 0.5835, "o": 0.5908, "p": 0.6103, "r": 0.3904, "s": 0.5139, "t": 0.3633, "u": 0.5835, "v": 0.542, "w": 0.7744, "y": 0.543, "·": 0.2969, "←": 0.9058, "↑": 0.7813, "→": 0.9058, "↓": 0.7813},
  '12.8/400': {"0": 0.6252, "1": 0.4592, "2": 0.5988, "3": 0.6223, "4": 0.6389, "5": 0.6135, "6": 0.6321, "7": 0.5837, "8": 0.634, "9": 0.6321, " ": 0.2766, "%": 0.9206, "'": 0.2922, "(": 0.3772, ")": 0.3772, ",": 0.2922, "-": 0.467, ".": 0.2922, "/": 0.3, ":": 0.2922, "A": 0.6692, "B": 0.6526, "C": 0.7111, "D": 0.7219, "E": 0.591, "F": 0.5676, "G": 0.7419, "H": 0.7375, "I": 0.2629, "J": 0.5334, "K": 0.654, "L": 0.5632, "M": 0.8693, "O": 0.7668, "P": 0.6306, "R": 0.6486, "S": 0.6325, "T": 0.6291, "W": 0.9631, "a": 0.5471, "b": 0.6096, "c": 0.5549, "d": 0.6096, "e": 0.5666, "f": 0.3572, "g": 0.6047, "h": 0.5837, "i": 0.2424, "j": 0.2419, "k": 0.5383, "l": 0.2483, "m": 0.8655, "n": 0.5788, "o": 0.5861, "p": 0.6057, "r": 0.3857, "s": 0.5092, "t": 0.3586, "u": 0.5788, "v": 0.5373, "w": 0.7697, "y": 0.5383, "·": 0.2922, "←": 0.9011, "↑": 0.7766, "→": 0.9011, "↓": 0.7766},
  '16/400': {"0": 0.6103, "1": 0.4443, "2": 0.584, "3": 0.6074, "4": 0.624, "5": 0.5986, "6": 0.6172, "7": 0.5688, "8": 0.6191, "9": 0.6172, " ": 0.2617, "%": 0.9058, "'": 0.2773, "(": 0.3623, ")": 0.3623, ",": 0.2773, "-": 0.4521, ".": 0.2773, "/": 0.2852, ":": 0.2773, "A": 0.6543, "B": 0.6377, "C": 0.6963, "D": 0.707, "E": 0.5762, "F": 0.5527, "G": 0.727, "H": 0.7227, "I": 0.248, "J": 0.5185, "K": 0.6392, "L": 0.5483, "M": 0.8545, "O": 0.752, "P": 0.6157, "R": 0.6338, "S": 0.6177, "T": 0.6143, "W": 0.9482, "a": 0.5322, "b": 0.5947, "c": 0.54, "d": 0.5947, "e": 0.5518, "f": 0.3423, "g": 0.5898, "h": 0.5688, "i": 0.2275, "j": 0.2271, "k": 0.5234, "l": 0.2334, "m": 0.8506, "n": 0.564, "o": 0.5713, "p": 0.5908, "r": 0.3709, "s": 0.4944, "t": 0.3438, "u": 0.564, "v": 0.5225, "w": 0.7549, "y": 0.5234, "·": 0.2773, "←": 0.8862, "↑": 0.7617, "→": 0.8862, "↓": 0.7617},
  '16/600': {"0": 0.647, "1": 0.4761, "2": 0.6103, "3": 0.6352, "4": 0.6528, "5": 0.6289, "6": 0.6484, "7": 0.5923, "8": 0.6558, "9": 0.6484, " ": 0.2461, "%": 0.9795, "'": 0.311, "(": 0.3936, ")": 0.3936, ",": 0.311, "-": 0.4605, ".": 0.311, "/": 0.3052, ":": 0.311, "A": 0.6934, "B": 0.6616, "C": 0.7134, "D": 0.7207, "E": 0.5938, "F": 0.5693, "G": 0.7363, "H": 0.75, "I": 0.2817, "J": 0.5605, "K": 0.6728, "L": 0.5664, "M": 0.876, "O": 0.7617, "P": 0.6411, "R": 0.6611, "S": 0.6431, "T": 0.6318, "W": 0.9761, "a": 0.5576, "b": 0.6196, "c": 0.5586, "d": 0.6196, "e": 0.5713, "f": 0.3762, "g": 0.6138, "h": 0.5981, "i": 0.2544, "j": 0.2539, "k": 0.5625, "l": 0.2612, "m": 0.8921, "n": 0.5933, "o": 0.5903, "p": 0.6152, "r": 0.4038, "s": 0.5232, "t": 0.3796, "u": 0.5933, "v": 0.5498, "w": 0.8032, "y": 0.5596, "·": 0.311, "←": 0.9111, "↑": 0.7842, "→": 0.9111, "↓": 0.7842},
};
/** A text's width in px at `size` px and `weight`, from the measured glyphs (kerning left out). */
function widthOf(text: string, size: 12 | 12.8 | 16, weight: 400 | 600 = 400): number {
  const t = GLYPHS[`${size}/${weight}`];
  return [...text].reduce((a, ch) => a + (t[ch] ?? 0.65), 0) * size;
}
/** The lines a text takes in `avail` px, words wrapped greedily at its spaces. Measured against Chrome for every toast at
 * the touch columns and every objective panel from 130 to 380 px wide, it never gives fewer lines than Chrome does. */
function linesOf(text: string, avail: number, size: 12 | 12.8 | 16, weight: 400 | 600 = 400): number {
  const space = widthOf(' ', size, weight);
  let lines = 1;
  let line = 0;
  for (const word of text.split(' ').filter(Boolean)) {
    const w = widthOf(word, size, weight);
    if (line === 0) line = w;
    else if (line + space + w <= avail) line += space + w;
    else {
      lines++;
      line = w;
    }
  }
  return lines;
}

// The copy the model lays out, in both languages.
const GAME = gameData(JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara);
const LANGS = ['id', 'en'] as const;
/** Every toast the game can show: each record's toast with its card's real date and channel at its chapter's largest
 * count, the prologue's count, the fixed lines and the lap lines. */
const TOAST_TEXTS = LANGS.flatMap((l) => {
  const t = GAME_COPY[l].toasts;
  return [
    ...GAME.events.flatMap((cards) => cards.map((c) => t.recorded({ n: cards.length, total: cards.length, date: c.dateLabel[l], channel: c.channel[l] }))),
    t.recordedPrologue({ n: 8, total: 8 }), t.filed, t.rewrite, t.ranks, t.checkpoint, t.wall, t.gate, t.letter,
    t.lap({ n: 5, seconds: 188.8, matched: false }), t.lap({ n: 5, seconds: 188.8, matched: true }),
  ];
});
/** The height (px) of the tallest real toast in a column `width` px wide, with the stage's toast type. */
function toastHeight(width: number, s: Stage): number {
  const sels = ['.bg-toast', '.bg-hud[data-touch] .bg-toast'];
  const size = px(valueOf(sels, 'font-size', s), 16);
  expect(size, 'the model is measured for 0.8rem toasts').toBe(12.8);
  const lineHeight = Number(maybeValueOf(sels, 'line-height', s) ?? '1.65');
  const [padY, padX] = valueOf(sels, 'padding', s).split(' ').map((p) => px(p, 0));
  const lines = Math.max(...TOAST_TEXTS.map((t) => linesOf(t, width - 2 * padX, 12.8)));
  return lines * size * lineHeight + 2 * padY;
}
/**
 * The objective panel's height (px) in its worst case at `width` px wide (the panel takes its max-width once its lines are
 * long): any objective with its largest counts, any touch hint or none, a timer, the frame line, and the Pause and Full
 * screen buttons, in either language. Lines at 1.65; the buttons at 16 px and 600 with 0.6rem and 1.25rem of padding, a
 * label wider than the panel wrapping, and the second button below the first when the two do not fit side by side.
 */
function panelHeight(width: number, s: Stage): number {
  const sel = (x: string) => ['.bg-objective', '.bg-hud[data-touch] .bg-objective'].map((p) => (x ? `${p} ${x}` : p));
  const [padY, padX] = valueOf(sel(''), 'padding', s).split(' ').map((p) => px(p, 0));
  const gap = px(valueOf(sel(''), 'gap', s), 0);
  const hintSize = px(valueOf(['.bg-hint'], 'font-size', s), 16);
  const frameSize = px(valueOf(['.bg-frame'], 'font-size', s), 16);
  expect([hintSize, frameSize], 'the model is measured for a 0.8rem hint and a 0.75rem frame line').toEqual([12.8, 12]);
  const actionsGap = px(valueOf(sel('.bg-actions'), 'gap', s), 0);
  const actionsTop = px(valueOf(sel('.bg-actions'), 'margin-top', s), 0);
  const text = width - 2 * padX;
  return Math.max(...LANGS.map((l) => {
    const c = GAME_COPY[l];
    const o = c.objectives;
    const objectives = [o.roam, o.prologue({ done: 8, total: 8 }), o.collect({ done: 9, total: 9 }), o.tower, o.gate, o.course({ done: 9, total: 9 }), o.laps({ n: 5 }), o.stop, null];
    const hints = [...Object.values(c.hints).map((h) => h.touch), null];
    const button = (label: string) => ({ w: widthOf(label, 16, 600) + 40, h: linesOf(label, text - 40, 16, 600) * 16 * 1.65 + 2 * 0.6 * 16 });
    const [a, b] = [button(c.hud.pause), button(c.fullscreen)];
    const actions = Math.min(a.w, text) + actionsGap + Math.min(b.w, text) <= text ? Math.max(a.h, b.h) : a.h + actionsGap + b.h;
    let worst = 0;
    for (const objective of objectives) {
      for (const hint of hints) {
        const rows = [
          objective === null ? null : linesOf(objective, text, 16) * 16 * 1.65,
          hint === null ? null : linesOf(hint, text, 12.8) * 12.8 * 1.65,
          16 * 1.65,
          linesOf(c.hudFrame, text, 12) * 12 * 1.65,
          actionsTop + actions,
        ].filter((x): x is number => x !== null);
        worst = Math.max(worst, 2 * padY + rows.reduce((x, y) => x + y, 0) + gap * (rows.length - 1));
      }
    }
    return worst;
  }));
}
/** Where the touch HUD's parts and the touch controls lie on a stage, in px from its top left, in their worst case. */
function lay(s: Stage) {
  const v = (sels: readonly string[], prop: string) => valueOf(sels, prop, s);
  const objSels = ['.bg-objective', '.bg-hud[data-touch] .bg-objective'];
  const panelLeft = px(v(objSels, 'left'), s.w);
  const panelTop = px(v(objSels, 'top'), s.h);
  const panelW = px(v(objSels, 'max-width'), s.w);
  const panel: Box = { left: panelLeft, top: panelTop, right: panelLeft + panelW, bottom: panelTop + panelHeight(panelW, s) };
  const radar = px(maybeValueOf(['.bg-radar__map', '.bg-hud[data-touch] .bg-radar__map'], 'width', s) ?? `${RADAR_PX}px`, s.w);
  const slotSels = ['.bg-radar-slot', '.bg-hud[data-touch] .bg-radar-slot'];
  const slotRight = s.w - px(v(slotSels, 'right'), s.w);
  const slotTop = px(v(slotSels, 'top'), s.h);
  const slot: Box = { left: slotRight - radar, right: slotRight, top: slotTop, bottom: slotTop + radar + PILL };
  const toastSels = ['.bg-toasts', '.bg-hud[data-touch] .bg-toasts'];
  const toastsRight = s.w - px(v(toastSels, 'right'), s.w);
  const toastsTop = px(v(toastSels, 'top'), s.h);
  const column = px(v(toastSels, 'max-width'), s.w);
  const toastH = toastHeight(column, s);
  const gap = px(v(['.bg-toasts'], 'gap'), 0);
  // Where the CSS hides the older toasts, only the newest shows.
  const newestOnly = maybeValueOf(['.bg-hud[data-touch] .bg-toast:not(:last-child)'], 'display', s) === 'none';
  const shown = newestOnly ? 1 : 2;
  const toasts: Box = { left: toastsRight - column, right: toastsRight, top: toastsTop, bottom: toastsTop + shown * toastH + (shown - 1) * gap };
  const buttons = Object.fromEntries(BUTTONS.map((k): [string, Box] => {
    const sel = [`.bg-touch__btn--${k}`];
    const right = s.w - px(v(sel, 'right'), s.w);
    const bottom = s.h - px(v(sel, 'bottom'), s.h);
    const size = px(v(sel, 'width'), s.w);
    return [k, { left: right - size, right, top: bottom - size, bottom }];
  }));
  const steer: Box = { left: 0, right: px(v(['.bg-touch__steer'], 'width'), s.w), top: s.h - px(v(['.bg-touch__steer'], 'height'), s.h), bottom: s.h };
  // The room under the toasts' top: to the stage's bottom or the highest button under their column, less the margin.
  const below = Object.values(buttons).filter((b) => b.left < toasts.right && toasts.left < b.right).map((b) => b.top);
  const room = Math.min(s.h, ...below) - 8 - toastsTop;
  return { panel, radar, slot, toasts, toastH, gap, room, newestOnly, buttons, steer };
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
      expect(['right', 'bottom', 'width', 'height'].map((p) => within(base, sel, p)), sel).toEqual([`${right}px`, `${bottom}px`, `${size}px`, `${size}px`]);
    }
    // On a short stage Maju would rise past the stage's top (it reaches 264 px up), so it takes the place left of Mata and
    // above Laju, at their size (Task 34). The other three keep theirs.
    const short = container('(width > 480px) and (height <= 520px)');
    expect(['right', 'bottom', 'width', 'height'].map((p) => within(short, '.bg-touch__btn--ride', p))).toEqual(['108px', '112px', '60px', '60px']);
    for (const k of ['rem', 'surge', 'mata']) expect(BLOCKS.filter((b) => within(b.text, `.bg-touch__btn--${k}`, 'right') !== undefined), k).toEqual([]);
    expect(declared('.bg-touch__steer', 'left')).toEqual(['0']);
    expect(declared('.bg-touch__steer', 'bottom')).toEqual(['0']);
    expect(declared('.bg-touch__steer', 'height')).toEqual(['55%']);
    expect(declared('.bg-touch__steer', 'width')).toEqual(['46%']);
    expect(declared('.bg-touch__steer', 'touch-action')).toEqual(['none']);
    expect(declared('.bg-touch__capsule', 'width')).toEqual(['140px']);
    expect(declared('.bg-touch__capsule', 'height')).toEqual(['56px']);
  });

  it('makes the HUD and the touch layer size containers, so their layout follows the stage, in the page or in full screen (Task 34)', () => {
    expect(has('.bg-hud', 'container: bg-hud / size')).toBe(true);
    expect(has('.bg-touch', 'container: bg-touch / size')).toBe(true);
    // Each @container block names one of the two, and styles only its own container's parts.
    const blocks = BLOCKS.filter((b) => b.kind === 'container');
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(['bg-hud', 'bg-touch'], b.cond).toContain(b.name);
      const sels = [...b.text.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
      for (const sel of sels) expect(b.name === 'bg-touch' ? sel.startsWith('.bg-touch') : !sel.includes('bg-touch'), `${b.name}: ${sel}`).toBe(true);
    }
    // The HUD's corner rules moved off the viewport: none is left in an @media block.
    for (const b of BLOCKS.filter((x) => x.kind === 'media')) {
      for (const sel of ['.bg-objective', '.bg-radar-slot', '.bg-gauges', '.bg-toasts', '.bg-hud[data-touch] .bg-toasts']) expect(within(b.text, sel, 'top') ?? within(b.text, sel, 'left') ?? within(b.text, sel, 'right'), `${b.cond}: ${sel}`).toBeUndefined();
    }
  });

  it('keeps the HUD above the touch layer, so where the objective panel runs into the steer zone its Pause and Full screen buttons still take their taps', () => {
    const z = (sel: string) => {
      const v = declared(sel, 'z-index');
      expect(v, sel).toHaveLength(1);
      return Number(v[0]);
    };
    expect(z('.bg-hud')).toBeGreaterThan(z('.bg-touch'));
    // Elsewhere the HUD lets every touch through to the steer zone and the buttons.
    expect(has('.bg-hud', 'pointer-events: none')).toBe(true);
    expect(rules.filter((r) => r.selector.includes('.bg-hud') && /pointer-events:\s*auto/.test(r.body)).map((r) => r.selector)).toEqual(['.bg-hud button']);
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
    // On touch the objective panel also stops 8 px short of Laju's column (168 px in from the right, past an inset).
    expect(within(base, '.bg-hud[data-touch] .bg-objective', 'max-width')).toBe('min(22rem, 46%, calc(100% - 184px))');
    const narrow = container('(width <= 480px)');
    expect(within(narrow, t, 'top')).toBe(`calc(0.5rem + ${RADAR_PX}px + 2.5rem)`);
    expect(within(narrow, t, 'right')).toBe('0.5rem');
    expect(within(narrow, t, 'max-width')).toBe('min(22rem, calc(54% - 1.5rem))');
    // A short stage: the radar shrinks to 112 px, and it and the toasts under it sit just left of the buttons' column
    // (168 px in), the toasts' column 8 px clear of the panel's 46% and its inset.
    const short = container('(width > 480px) and (height <= 520px)');
    for (const sel of ['.bg-hud[data-touch] .bg-radar__map', '.bg-hud[data-touch] .bg-riuh svg']) {
      expect([within(short, sel, 'width'), within(short, sel, 'height')], sel).toEqual(['112px', '112px']);
    }
    expect(within(short, '.bg-hud[data-touch] .bg-radar-slot', 'right')).toBe('calc(168px + 0.5rem)');
    expect(within(short, t, 'top')).toBe('calc(0.75rem + 112px + 2.5rem)');
    expect(within(short, t, 'right')).toBe('calc(168px + 0.5rem)');
    expect(within(short, t, 'max-width')).toBe('calc(54% - 168px - 1.75rem)');
    expect(within(short, '.bg-hud[data-touch] .bg-objective', 'max-width')).toBeUndefined();
  });

  it('at every listed phone, in the page and in full screen, the objective panel at its worst, the radar, its speed, the toasts and every button fit the stage and keep 8 px apart', () => {
    expect(STAGES).toHaveLength(18);
    // The in-page stages under the real header: 780×360 is 245 px tall, not the 301 px the 59 px fallback gives.
    expect(STAGES.find((s) => s.name === '780×360 in the page')).toMatchObject({ w: 748, h: 245 });
    for (const s of STAGES) {
      const L = lay(s);
      const where = s.name;
      // Soft: one run lists every stage's every miss.
      const inside = (b: Box, what: string) => {
        expect.soft(b.left, `${where}: ${what}, left`).toBeGreaterThanOrEqual(8);
        expect.soft(b.top, `${where}: ${what}, top`).toBeGreaterThanOrEqual(8);
        expect.soft(b.right, `${where}: ${what}, right`).toBeLessThanOrEqual(s.w - 8);
        expect.soft(b.bottom, `${where}: ${what}, bottom`).toBeLessThanOrEqual(s.h - 8);
      };
      // The panel's last row is the Pause and Full screen buttons, so the panel inside the stage keeps them whole.
      inside(L.panel, 'the objective panel');
      inside(L.slot, 'the radar and its speed');
      inside(L.toasts, 'the toasts');
      for (const [name, b] of Object.entries(L.buttons)) inside(b, name);
      // Every two parts keep 8 px apart, but the toasts, which hang under the speed pill in one column (4 px at least).
      const parts: [string, Box][] = [['the objective panel', L.panel], ['the radar', L.slot], ['the toasts', L.toasts], ...Object.entries(L.buttons)];
      for (const [i, [a, x]] of parts.entries()) {
        for (const [b, y] of parts.slice(i + 1)) {
          if (a === 'the radar' && b === 'the toasts') continue;
          expect.soft(apart(x, y, 8), `${where}: ${a} and ${b}`).toBe(true);
        }
      }
      expect.soft(L.toasts.top, where).toBeGreaterThanOrEqual(L.slot.bottom + 4);
      // The radar and the toasts stay clear of the steer zone too (the panel may run into it: see the z-order test).
      expect.soft(apart(L.slot, L.steer, 8), `${where}: the radar and the steer zone`).toBe(true);
      expect.soft(apart(L.toasts, L.steer, 8), `${where}: the toasts and the steer zone`).toBe(true);
      // The newest toast always fits under the radar; the older one shows exactly where two fit, in both directions.
      expect.soft(L.toastH, `${where}: the newest toast needs ${L.toastH} of ${L.room} px`).toBeLessThanOrEqual(L.room);
      const two = 2 * L.toastH + L.gap;
      expect.soft(L.newestOnly, `${where}: two toasts need ${two.toFixed(1)} of ${L.room.toFixed(1)} px`).toBe(two > L.room);
    }
    // Upright, the radar keeps the top right corner.
    for (const s of STAGES.filter((x) => x.vh > x.vw)) expect.soft(lay(s).slot.right, s.name).toBeGreaterThanOrEqual(s.w - 12);
  });

  it('hides the older toast exactly where two do not fit, on both sides of every threshold, between the listed phones too', () => {
    // Each pair straddles one threshold: the stage's height a pixel either side of where two of the tallest toasts stop
    // fitting, or its width a pixel either side of where the tallest toast changes its lines. Upright (up to 480 px wide),
    // wide (taller than 520 px), and on its side.
    const sizes = [
      [341, 641], [341, 642], [342, 641], [342, 604], [342, 605], [480, 604], [480, 605],
      [481, 608], [481, 609], [503, 608], [504, 608], [504, 571], [504, 572], [1100, 571], [1100, 572],
      [808, 271], [808, 272], [807, 271], [807, 308], [807, 309], [660, 308], [660, 309], [659, 308], [659, 345], [659, 346],
      [600, 345], [600, 346], [599, 345], [599, 382], [599, 383], [572, 382], [572, 383], [571, 382], [571, 419], [571, 420],
      [537, 419], [537, 420], [536, 419], [536, 456], [536, 457], [522, 456], [522, 457], [521, 456], [521, 493], [521, 494],
      [516, 493], [516, 494], [515, 493], [515, 520], [481, 520],
    ];
    for (const [w, h] of sizes) {
      const L = lay({ name: `${w}×${h}`, vw: w, vh: h, w, h });
      const two = 2 * L.toastH + L.gap;
      expect.soft(L.newestOnly, `${w}×${h}: two toasts need ${two.toFixed(1)} of ${L.room.toFixed(1)} px`).toBe(two > L.room);
    }
  });

  it('never hides the newest toast: only older ones are hidden, whole, and only by the stage\'s own height', () => {
    const sel = '.bg-hud[data-touch] .bg-toast:not(:last-child)';
    const hiding = rules.filter((r) => r.selector.includes('.bg-toast') && /(^|;\s*)display:\s*none/.test(r.body));
    expect(hiding.length).toBeGreaterThan(0);
    for (const r of hiding) {
      for (const x of r.selector.split(',').map((y) => y.trim())) expect(x).toBe(sel);
    }
    // In the page the stage is shorter than the screen, so the rule asks the HUD's own size, never the viewport's.
    expect(within(base, sel, 'display')).toBeUndefined();
    const where = BLOCKS.filter((b) => within(b.text, sel, 'display') !== undefined);
    expect(where.length).toBeGreaterThan(0);
    for (const b of where) expect([b.kind, b.name], b.cond).toEqual(['container', 'bg-hud']);
    // Hidden whole: nothing clips a toast's height or its text.
    for (const s of ['.bg-toast', '.bg-toasts', '.bg-hud[data-touch] .bg-toast', '.bg-hud[data-touch] .bg-toasts']) {
      for (const p of ['max-height', 'height', 'overflow', 'text-overflow', '-webkit-line-clamp']) expect(declared(s, p), `${s} ${p}`).toEqual([]);
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

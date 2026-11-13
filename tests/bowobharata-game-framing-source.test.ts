import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'vite';
import { BRAND } from './bowobharata-game-brand';

// Framing guards on the game's source files (spec: open-world anti-goals and calls 17 and 21). Every word the game shows
// comes from copy.ts, whose own word lists live in bowobharata-game-copy.test.ts; these checks keep text out of the JSX
// and the reference games' names out of every game file.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const ISLAND = 'src/components/BowobharataGame.tsx';
const SCREENS = 'src/components/bowobharata-game';
const LIB = 'src/lib/bowobharata-game';
const CSS = 'src/styles/bowobharata-game.css';
const PAGES = ['src/pages/pantau/bowobharata.astro', 'src/pages/en/monitor/bowobharata.astro'];

/** The game's own code: the island, its screens and everything under lib/bowobharata-game, world/ included. */
const SOURCES = [ISLAND, ...walk(SCREENS), ...walk(LIB)];
/** Every JSX file of the game. */
const JSX = SOURCES.filter((f) => f.endsWith('.tsx'));
const read = (f: string) => readFileSync(f, 'utf8');

/** Text between a closing `>` and the next `</`, holding a letter: a word written straight into the JSX. */
const JSX_TEXT = />[^<>{}]*[A-Za-z][^<>{}]*<\//;
/** A literal aria-label, title or alt holding a letter. */
const LITERAL_ATTR = /\s(?:aria-label|title|alt)=(?:"[^"]*[A-Za-z][^"]*"|'[^']*[A-Za-z][^']*')/;
const HARM_IDENT = /\b(?:kill|takedown|wanted|enemy|enemies)\b/i;

/** Code without its comments. Strings stay: class names and data attributes are identifiers too. */
const uncommented = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

type AstNode = { type?: string; [key: string]: unknown };
const LABELS = new Set(['aria-label', 'title', 'alt']);
const hasLetter = (s: string) => /[A-Za-z]/.test(s);
/** The fixed text an expression can render: a string literal, a template literal's fixed parts, or either branch of a
 * conditional (x ? 'Yes' : 'No') or logical (x && 'Shown') expression, through any parentheses. A copy lookup or a
 * call renders no fixed text. */
function fixedTexts(e: unknown): string[] {
  const n = e as AstNode | null;
  switch (n?.type) {
    case 'Literal':
      return typeof n.value === 'string' ? [n.value] : [];
    case 'TemplateLiteral':
      return [(n.quasis as { value: { cooked: string | null } }[]).map((q) => q.value.cooked ?? '').join('')];
    case 'ParenthesizedExpression':
      return fixedTexts(n.expression);
    case 'ConditionalExpression':
      return [...fixedTexts(n.consequent), ...fixedTexts(n.alternate)];
    case 'LogicalExpression':
      return [...fixedTexts(n.left), ...fixedTexts(n.right)];
    default:
      return [];
  }
}

/** Words written straight into JSX, found by parsing it, and the number of JSX elements the walk saw. Words are text
 * nodes (also beside an expression), fixed text in a child expression, and aria-label, title or alt values given as
 * fixed text, in quotes or in braces. */
function literalJsxWords(name: string, src: string): { words: string[]; elements: number } {
  const { program, errors } = parseSync(name, src, { lang: 'tsx' });
  if (errors.length > 0) throw new Error(`${name} does not parse: ${errors.map((e) => e.message).join('; ')}`);
  const words: string[] = [];
  let elements = 0;
  const report = (kind: string, texts: string[]) => {
    for (const s of texts) if (hasLetter(s)) words.push(`${name}: ${kind} ${JSON.stringify(s.trim())}`);
  };
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const n = v as AstNode;
    if (n.type === 'JSXText') report('text', [String(n.value)]);
    if (n.type === 'JSXElement') elements++;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      for (const c of n.children as AstNode[]) if (c.type === 'JSXExpressionContainer') report('child', fixedTexts(c.expression));
    }
    if (n.type === 'JSXAttribute' && LABELS.has(String((n.name as AstNode).name))) {
      const val = n.value as AstNode | null;
      report(String((n.name as AstNode).name), val?.type === 'JSXExpressionContainer' ? fixedTexts(val.expression) : fixedTexts(val));
    }
    for (const [k, x] of Object.entries(n)) if (k !== 'parent') visit(x);
  };
  visit(program);
  return { words, elements };
}

/** A positive control: one planted form per line, then a clean line built only from lookups and separators. If the
 * parser's output drifts (a renamed node, a new wrapper), the walker stops finding these and the canary test fails. */
const CANARY = [
  'const Canary = ({ c, s, x }: { c: { x: string }; s: string; x: boolean }) => (',
  '  <div>',
  '    <p>Lost</p>',
  '    <p>Lost {c.x}</p>',
  '    <span>{s} km/h</span>',
  "    <b>{'Pause'}</b>",
  "    <i aria-label={'Pause'} title='Play' />",
  "    <em>{x ? 'Yes' : 'No'}</em>",
  "    <u>{x && 'Shown'}</u>",
  "    <s>{(x || ('Wrapped'))}</s>",
  '    <a aria-label={c.x} title={`${c.x}. ${s}`}>{c.x} · {s}</a>',
  '  </div>',
  ');',
].join('\n');

/** Each identifier as written and split into words (camelCase, PascalCase, snake_case and kebab-case). */
function identifierForms(src: string): string[] {
  const ids = uncommented(src).match(/[A-Za-z_$][\w$]*/g) ?? [];
  return ids.flatMap((id) => [id, id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_$]+/g, ' ')]);
}

describe('bowobharata-game framing (source)', () => {
  it('covers the island, its screens, the lib, the CSS and both game pages', () => {
    expect(JSX).toContain(ISLAND);
    expect(JSX).toContain(join(SCREENS, 'screens.tsx'));
    for (const f of ['copy.ts', 'mission-run.ts', 'missions.ts']) expect(SOURCES).toContain(join(LIB, f));
    for (const f of [CSS, ...PAGES]) expect(read(f).length).toBeGreaterThan(0);
  });

  it('no JSX text with letters in the island or its screens: every word comes from copy.ts', () => {
    for (const f of JSX) expect(read(f).match(JSX_TEXT)?.[0] ?? null, f).toBeNull();
  });

  it('no literal aria-label, title or alt with letters in the island or its screens', () => {
    for (const f of JSX) expect(read(f).match(LITERAL_ATTR)?.[0] ?? null, f).toBeNull();
  });

  it('the parser check finds every planted form in the canary, and nothing in its clean line', () => {
    const { words, elements } = literalJsxWords('canary.tsx', CANARY);
    expect(elements).toBe(10);
    expect(words.sort()).toEqual(
      [
        'aria-label "Pause"', 'child "No"', 'child "Pause"', 'child "Shown"', 'child "Wrapped"', 'child "Yes"',
        'text "Lost"', 'text "Lost"', 'text "km/h"', 'title "Play"',
      ].map((w) => `canary.tsx: ${w}`).sort(),
    );
  });

  it('parsed, the JSX holds no written word: no text beside an expression, no fixed text in a child or a label', () => {
    for (const f of JSX) {
      const { words, elements } = literalJsxWords(f, read(f));
      expect(elements, `${f}: JSX elements seen`).toBeGreaterThan(0);
      expect(words).toEqual([]);
    }
  });

  it('no name of the reference games in the game sources, the game CSS, both game pages or their file names', () => {
    for (const f of [...SOURCES, CSS, ...PAGES]) {
      expect(f.match(BRAND)?.[0] ?? null, `file name ${f}`).toBeNull();
      expect(read(f).match(BRAND)?.[0] ?? null, f).toBeNull();
    }
  });

  it('the game CSS loads no font of its own', () => {
    expect(read(CSS)).not.toMatch(/@font-face/i);
  });

  it('game code identifiers carry no word of harm or pursuit', () => {
    const found = [...SOURCES, CSS, ...PAGES].flatMap((f) => identifierForms(read(f)).filter((w) => HARM_IDENT.test(w)).map((w) => `${f}: ${w}`));
    expect(found).toEqual([]);
  });
});

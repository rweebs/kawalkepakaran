import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'vite';

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

const BRAND = /\b(?:gta|grand\s+theft(?:\s+auto)?|rockstar|take-two|los\s+santos|san\s+andreas|vinewood|vice\s+city|liberty\s+city|pricedown|chalet|signpainter|grand?\s+turismo|polyphony|mission\s+(?:passed|failed)|wanted\s+level)\b/i;
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
/** The text of a string literal or of a template literal's fixed parts; null for any other expression. */
function fixedText(e: unknown): string | null {
  const n = e as AstNode | null;
  if (n?.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n?.type === 'TemplateLiteral') return (n.quasis as { value: { cooked: string | null } }[]).map((q) => q.value.cooked ?? '').join('');
  return null;
}

/** Words written straight into a file's JSX, found by parsing it: text nodes (also beside an expression), string
 * children such as {'Pause'}, and aria-label, title or alt values given as a literal, in quotes or in braces. */
function literalJsxWords(file: string): string[] {
  const { program, errors } = parseSync(file, read(file), { lang: 'tsx' });
  if (errors.length > 0) throw new Error(`${file} does not parse`);
  const found: string[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== 'object') return;
    const n = v as AstNode;
    if (n.type === 'JSXText' && hasLetter(String(n.value))) found.push(`text ${JSON.stringify(n.value)}`);
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      for (const c of n.children as AstNode[]) {
        const s = c.type === 'JSXExpressionContainer' ? fixedText(c.expression) : null;
        if (s !== null && hasLetter(s)) found.push(`child ${JSON.stringify(s)}`);
      }
    }
    if (n.type === 'JSXAttribute' && LABELS.has(String((n.name as AstNode).name))) {
      const val = n.value as AstNode | null;
      const s = val?.type === 'JSXExpressionContainer' ? fixedText(val.expression) : fixedText(val);
      if (s !== null && hasLetter(s)) found.push(`${String((n.name as AstNode).name)} ${JSON.stringify(s)}`);
    }
    for (const [k, x] of Object.entries(n)) if (k !== 'parent') visit(x);
  };
  visit(program);
  return found.map((w) => `${file}: ${w}`);
}

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

  it('parsed, the JSX holds no written word: no text beside an expression, string child or literal label either', () => {
    expect(JSX.flatMap(literalJsxWords)).toEqual([]);
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

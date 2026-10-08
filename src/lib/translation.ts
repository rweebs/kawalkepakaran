const EN = new Set(
  'the and of to is that with for was his he this are as by from which not have has had were been be on at it its their they who whom'.split(' '),
);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
}

export function englishRatio(text: string): number {
  const w = words(text);
  if (w.length === 0) return 0;
  return w.filter((x) => EN.has(x)).length / w.length;
}

export function findEnglishBlocks(md: string, opts: { minWords?: number; threshold?: number } = {}): string[] {
  const minWords = opts.minWords ?? 20;
  const threshold = opts.threshold ?? 0.15;
  const body = md.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '');
  return body
    .split(/\n\s*\n/)
    .map((block) => block
      .replace(/^[>|*#\-\s]+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim())
    .filter((text) => words(text).length >= minWords && englishRatio(text) > threshold);
}

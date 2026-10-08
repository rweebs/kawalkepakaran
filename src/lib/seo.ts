export function truncateAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const i = cut.lastIndexOf(' ');
  const base = i > max * 0.5 ? cut.slice(0, i) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

export function buildTitle(title: string, brand: string, shortBrand: string, max = 60): string {
  if (title === brand) return brand;
  const long = `${title} · ${brand}`;
  if (long.length <= max) return long;
  // A title that already names the subject keeps the short brand; one that does not gets the subject as its suffix.
  const subject = brand.replace(/^Kawal\s+/i, '');
  const suffix = ` · ${title.toLowerCase().includes(subject.toLowerCase()) ? shortBrand : subject}`;
  return truncateAtWord(title, max - suffix.length) + suffix;
}

function stripMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function descriptionFromMarkdown(md: string, max = 155, min = 70): string {
  const body = md.replace(/^---[\s\S]*?---/, '');
  for (const block of body.split(/\n\s*\n/)) {
    if (/^\s*#{1,6}\s/.test(block)) continue;
    const text = stripMarkdown(block);
    if (text.length >= min) return truncateAtWord(text, max);
  }
  return '';
}

export function breadcrumbLd(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

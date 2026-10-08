export interface HeaderImage { src: string; alt: string }

export function firstImage(md: string): HeaderImage | null {
  const body = md.replace(/^---[\s\S]*?---/, '');
  const m = body.match(/!\[([^\]]*)\]\((\/img\/[^)\s]+)\)/);
  return m ? { src: m[2], alt: m[1].trim() } : null;
}

export function hueFromSlug(slug: string): number {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

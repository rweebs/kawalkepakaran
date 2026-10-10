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

/** Intrinsic size of a /img/ file under public/, read at build time so the header reserves its exact box. Null if unreadable. */
export async function imageSize(src: string, publicDir = 'public'): Promise<{ width: number; height: number } | null> {
  if (!src.startsWith('/img/')) return null;
  try {
    const { default: sharp } = await import('sharp');
    const { join } = await import('node:path');
    const m = await sharp(join(publicDir, decodeURIComponent(src))).metadata();
    return m.width && m.height ? { width: m.width, height: m.height } : null;
  } catch {
    return null;
  }
}

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { findProblems } from '../scripts/check-dist.mjs';

let dir: string;
const NAV = '<details class="nav__menu" open></details>';
const OG = '<meta property="og:image" content="https://kawalkepakaran.org/og/kawal-og.png" />';
const DESC = 'Deskripsi uji yang cukup panjang untuk memenuhi batas minimal tujuh puluh karakter pada halaman uji ini.';
const urlOf = (rel: string) => 'https://kawalkepakaran.org' + (rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, ''));
const page = (body: string, opts: { banner?: boolean; nav?: string; og?: string; rel?: string; head?: string; h1?: number; lang?: string } = {}) => {
  const rel = opts.rel ?? 'index.html';
  const h1 = '<h1>Judul</h1>'.repeat(opts.h1 ?? 1);
  const head = opts.head ?? `<title>Judul halaman uji</title><meta name="description" content="${DESC}" /><link rel="canonical" href="${urlOf(rel)}" />`;
  return `<html lang="${opts.lang ?? 'id'}"><head>${head}${opts.og ?? OG}</head><body>${opts.banner === false ? '' : '<div data-disclaimer></div>'}${opts.nav ?? NAV}${h1}${body}</body></html>`;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dir, 'img'), { recursive: true });
  mkdirSync(join(dir, 'artikel'), { recursive: true });
  mkdirSync(join(dir, 'og'), { recursive: true });
  writeFileSync(join(dir, 'og', 'kawal-og.png'), 'x');
  writeFileSync(join(dir, 'img', 'a.png'), 'x');
  writeFileSync(join(dir, 'artikel.html'), page('ok', { rel: 'artikel.html' }));
  writeFileSync(join(dir, 'artikel', 'x.html'), page('ok', { rel: 'artikel/x.html' }));
});

describe('findProblems', () => {
  it('returns no problems for a clean dist', () => {
    writeFileSync(join(dir, 'index.html'), page('<img src="/img/a.png"><a href="/artikel">x</a>'));
    expect(findProblems(dir)).toEqual([]);
  });
  it('flags a page without the disclaimer banner', () => {
    writeFileSync(join(dir, 'index.html'), page('hi', { banner: false }));
    expect(findProblems(dir).join('\n')).toContain('disclaimer');
  });
  it('flags a missing image', () => {
    writeFileSync(join(dir, 'index.html'), page('<img src="/img/missing.png">'));
    expect(findProblems(dir).join('\n')).toContain('/img/missing.png');
  });
  it('flags a broken root-relative link', () => {
    writeFileSync(join(dir, 'index.html'), page('<a href="/nope">x</a>'));
    expect(findProblems(dir).join('\n')).toContain('/nope');
  });
  it('flags a broken single-quoted link', () => {
    writeFileSync(join(dir, 'index.html'), page("<a href='/in/sq'>x</a>"));
    expect(findProblems(dir).join('\n')).toContain('/in/sq');
  });
  it('flags a broken own-domain absolute link', () => {
    writeFileSync(join(dir, 'index.html'), page('<a href="https://kawalkepakaran.org/in/missing">x</a>'));
    expect(findProblems(dir).join('\n')).toContain('/in/missing');
  });
  it('flags a broken relative link resolved against the page', () => {
    writeFileSync(join(dir, 'artikel', 'y.html'), page('<a href="rel-missing">x</a>', { rel: 'artikel/y.html' }));
    writeFileSync(join(dir, 'index.html'), page('ok'));
    expect(findProblems(dir).join('\n')).toContain('rel-missing');
  });
  it('ignores external, mailto and fragment links', () => {
    writeFileSync(join(dir, 'index.html'), page('<a href="https://example.com/x">a</a><a href="mailto:a@b.c">b</a><a href="#top">c</a>'));
    expect(findProblems(dir)).toEqual([]);
  });
  it('flags a page whose nav menu is not open by default', () => {
    writeFileSync(join(dir, 'index.html'), page('ok', { nav: '<details class="nav__menu"></details>' }));
    expect(findProblems(dir).join('\n')).toContain('nav menu');
  });
  it('flags a page without an og:image', () => {
    writeFileSync(join(dir, 'index.html'), page('ok', { og: '' }));
    expect(findProblems(dir).join('\n')).toContain('og:image');
  });
  it('flags an og:image whose file does not exist', () => {
    writeFileSync(join(dir, 'index.html'), page('ok', { og: '<meta property="og:image" content="https://kawalkepakaran.org/og/missing.png" />' }));
    expect(findProblems(dir).join('\n')).toContain('/og/missing.png');
  });
  it('flags a title that is too long', () => {
    const head = `<title>${'Judul sangat panjang '.repeat(6)}</title><meta name="description" content="${DESC}" /><link rel="canonical" href="https://kawalkepakaran.org/" />`;
    writeFileSync(join(dir, 'index.html'), page('ok', { head }));
    expect(findProblems(dir).join('\n')).toContain('title length');
  });
  it('flags a missing or too-short meta description', () => {
    const head = '<title>Judul halaman uji</title><meta name="description" content="pendek" /><link rel="canonical" href="https://kawalkepakaran.org/" />';
    writeFileSync(join(dir, 'index.html'), page('ok', { head }));
    expect(findProblems(dir).join('\n')).toContain('meta description');
  });
  it('flags a page with zero or several h1', () => {
    writeFileSync(join(dir, 'index.html'), page('ok', { h1: 0 }));
    expect(findProblems(dir).join('\n')).toContain('h1');
    writeFileSync(join(dir, 'index.html'), page('ok', { h1: 2 }));
    expect(findProblems(dir).join('\n')).toContain('h1');
  });
  it('flags a canonical that does not match the page url', () => {
    const head = `<title>Judul halaman uji</title><meta name="description" content="${DESC}" /><link rel="canonical" href="https://kawalkepakaran.org/lain" />`;
    writeFileSync(join(dir, 'index.html'), page('ok', { head }));
    expect(findProblems(dir).join('\n')).toContain('canonical');
  });
  it('flags invalid JSON-LD', () => {
    writeFileSync(join(dir, 'index.html'), page('<script type="application/ld+json">{oops</script>'));
    expect(findProblems(dir).join('\n')).toContain('JSON-LD');
  });
  it('flags a page whose html lang is not id', () => {
    writeFileSync(join(dir, 'index.html'), page('ok', { lang: 'en' }));
    expect(findProblems(dir).join('\n')).toContain('lang');
  });
  it('does not require description, h1 count or canonical on a noindex page', () => {
    const head = '<title>Tidak ditemukan</title><meta name="robots" content="noindex" />';
    writeFileSync(join(dir, 'index.html'), page('ok', { head, h1: 1 }));
    expect(findProblems(dir)).toEqual([]);
  });
  it('fails when there are zero pages', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dist-empty-'));
    expect(findProblems(empty).join('\n')).toContain('no HTML pages');
  });
});

describe('adapter-style layout (dist/client)', () => {
  it('checks the client folder as the site root', () => {
    const root = mkdtempSync(join(tmpdir(), 'dist-adapter-'));
    const client = join(root, 'client');
    mkdirSync(join(client, 'og'), { recursive: true });
    writeFileSync(join(client, 'og', 'kawal-og.png'), 'x');
    writeFileSync(join(client, 'menu.js'), 'x');
    writeFileSync(join(client, 'index.html'), page('<a href="/">x</a><script src="/menu.js"></script>'));
    mkdirSync(join(root, 'server'), { recursive: true });
    writeFileSync(join(root, 'server', 'entry.mjs'), 'x');
    expect(findProblems(root)).toEqual([]);
  });
  it('still reports problems inside dist/client', () => {
    const root = mkdtempSync(join(tmpdir(), 'dist-adapter-bad-'));
    const client = join(root, 'client');
    mkdirSync(join(client, 'og'), { recursive: true });
    writeFileSync(join(client, 'og', 'kawal-og.png'), 'x');
    writeFileSync(join(client, 'index.html'), page('<a href="/nope">x</a>'));
    expect(findProblems(root).join('\n')).toContain('/nope');
  });
});


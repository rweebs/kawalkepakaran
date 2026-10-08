import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import Reveal from '../src/components/motion/Reveal';
import TiltCard from '../src/components/motion/TiltCard';
import ParallaxHeader from '../src/components/motion/ParallaxHeader';

describe('motion islands render on the server', () => {
  it('Reveal renders its children', () => {
    expect(renderToString(<Reveal><p>halo</p></Reveal>)).toContain('halo');
  });
  it('TiltCard renders a link with its children', () => {
    const html = renderToString(<TiltCard href="/kawal/x"><span>isi</span></TiltCard>);
    expect(html).toContain('href="/kawal/x"');
    expect(html).toContain('isi');
  });
  it('ParallaxHeader renders the image with its alt text', () => {
    const html = renderToString(<ParallaxHeader src="/img/a.png" alt="alt teks" />);
    expect(html).toContain('/img/a.png');
    expect(html).toContain('alt teks');
  });
});

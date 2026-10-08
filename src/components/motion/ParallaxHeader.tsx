import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';

export default function ParallaxHeader({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);

  return (
    <figure ref={ref} className="post-header" data-post-header>
      {reduce
        ? <img src={src} alt={alt} width={1280} height={720} loading="eager" decoding="async" />
        : <motion.img src={src} alt={alt} width={1280} height={720} loading="eager" decoding="async" style={{ y }} />}
    </figure>
  );
}

import type { PointerEvent, ReactNode } from 'react';
import { motion, MotionConfig, useMotionValue, useSpring } from 'motion/react';
import { tiltFor } from '../../lib/tilt';

export default function TiltCard({ href, children, max = 8 }: { href: string; children: ReactNode; max?: number }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 200, damping: 20 });
  const sry = useSpring(ry, { stiffness: 200, damping: 20 });

  function onMove(e: PointerEvent<HTMLAnchorElement>) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = tiltFor(e.clientX - r.left, e.clientY - r.top, r.width, r.height, max);
    rx.set(t.rotateX);
    ry.set(t.rotateY);
  }
  function onLeave() { rx.set(0); ry.set(0); }

  return (
    <MotionConfig reducedMotion="user">
      <motion.a
        href={href}
        className="card card--link card-link tilt"
        style={{ rotateX: srx, rotateY: sry, transformPerspective: 800 }}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        {children}
      </motion.a>
    </MotionConfig>
  );
}

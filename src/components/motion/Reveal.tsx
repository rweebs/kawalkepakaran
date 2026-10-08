import type { ReactNode } from 'react';
import { motion, MotionConfig } from 'motion/react';

export default function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-10%' }}
        transition={{ duration: 0.6, delay }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}

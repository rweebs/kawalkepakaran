/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Tests that render .astro pages through Astro's container. Astro's own Vite config compiles .astro, so these run apart
// from the default suite (vitest.config.ts), whose tests/** glob cannot. `npm test` runs both.
export default getViteConfig({
  test: {
    include: ['tests-astro/**/*.test.ts'],
  },
});

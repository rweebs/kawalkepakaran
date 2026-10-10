import { defineConfig } from 'vitest/config';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: { provider: 'v8', include: ['src/lib/**', 'scripts/**'], reporter: ['text-summary', 'lcov'] },
  },
});

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Standalone test config — intentionally does NOT extend vite.config.ts so the
 * Cesium / PWA plugins (which need a browser-y build pipeline) never load in
 * the unit-test runner. Only the `@/` path alias is mirrored from tsconfig.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});

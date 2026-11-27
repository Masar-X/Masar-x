import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = path.normalize(fileURLToPath(new URL('./src', import.meta.url)));

// Spec 022 Stage 7 — explicit config (mobile previously ran on vitest
// defaults). Pure-logic node tests; RN screens/hooks are a documented
// non-goal (would need @testing-library/react-native + react-dom).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // Spec 040: coverage reporter pinned so coverage-summary.json always
    // exists for the CI artifact. T-016 ratchet: thresholds sit 2 points
    // under the measured baseline (mobile: L80.35/B65.44/F82.22/S77.91 measured on
    // 2026-11-27) so CI stays green today while blocking regressions.
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 78.3, branches: 63.4, functions: 80.2, statements: 75.9 },
    },
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${src}/` }],
  },
});

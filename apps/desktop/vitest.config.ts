import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.ts',
      '__tests__/**/*.test.ts',
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Spec 040: coverage reporter pinned so coverage-summary.json always
    // exists for the CI artifact. T-016 ratchet: thresholds sit 2 points
    // under the measured baseline (desktop: L80.24/B75.16/F73.46/S78.37 measured on
    // 2026-11-27) so CI stays green today while blocking regressions.
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 78.2, branches: 73.1, functions: 71.4, statements: 76.3 },
    },
  },
});

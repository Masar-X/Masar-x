import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = path.normalize(fileURLToPath(new URL('./src', import.meta.url)));

// Spec 022 Stage 2 — shared package tests. Pure logic only (no DOM needed).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // Spec 040: coverage reporter pinned so coverage-summary.json always
    // exists for the CI artifact. T-016 ratchet: thresholds sit 2 points
    // under the measured baseline (masarx-shared: L99.39/B88.73/F90/S99.28 measured on
    // 2026-11-27) so CI stays green today while blocking regressions.
    coverage: {
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 97.3, branches: 86.7, functions: 88, statements: 97.2 },
    },
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${src}/` }],
  },
});

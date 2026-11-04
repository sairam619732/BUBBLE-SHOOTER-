import { defineConfig } from 'vitest/config';

// Runs the offline level calibration (bot plays every level) and rewrites src/core/levelCalib.ts.
export default defineConfig({
  test: {
    include: ['scripts/calibrate.test.ts'],
    testTimeout: 600_000,
  },
});

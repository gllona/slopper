import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Several test files launch Chromium; on small CI runners too many at once makes screenshots flaky.
    maxWorkers: process.env.CI ? 2 : undefined,
  },
});

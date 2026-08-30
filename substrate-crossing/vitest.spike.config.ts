import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/spike/**/*.test.ts'],
    testTimeout: 90_000,
    passWithNoTests: false,
  },
});

import { defineConfig } from 'vitest/config';

// vitest requires default export — framework convention, not application code
export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});

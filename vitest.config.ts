import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});

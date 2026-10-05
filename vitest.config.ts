import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,                       // describe/it/expect/vi ohne Import, wie bisher unter Jest
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/a11y/**', 'node_modules/**']
  }
});

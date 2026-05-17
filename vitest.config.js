import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup/index.js'],
    include: ['test/**/*.test.{js,jsx}'],
    css: false,
  },
});

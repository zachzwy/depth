import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    preact(),
    crx({ manifest }),
  ],
  esbuild: {
    // Mark console.log as side-effect-free so the minifier drops the calls
    // in production builds. Dev mode skips minification, so logs still
    // appear during `npm run dev`. console.warn/error are preserved.
    pure: ['console.log'],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});

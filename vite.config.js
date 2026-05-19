import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig(({ command }) => {
  // The Chrome Web Store rejects manifests that include `key`. Strip it
  // for production builds; dev keeps it so unpacked installs stay on the
  // pinned dev ID (matters for the Supabase OAuth redirect allowlist).
  const { key: _devKey, ...manifestNoKey } = manifest;
  const manifestForCrx = command === 'build' ? manifestNoKey : manifest;

  return {
    plugins: [
      preact(),
      crx({ manifest: manifestForCrx }),
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
  };
});

import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Stub `import x from './foo?script'` (a @crxjs/vite-plugin virtual) so the
// service-worker module can be imported under vitest. The value mirrors what
// crxjs would substitute at build time: the relative path to the script.
function stubScriptQuery() {
  return {
    name: 'depth-stub-script-query',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('?script')) return '\0' + source;
      return null;
    },
    load(id) {
      if (id.startsWith('\0') && id.endsWith('?script')) {
        const path = id.slice(1, -'?script'.length);
        return `export default ${JSON.stringify(path)};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [stubScriptQuery(), preact()],
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup/index.js'],
    include: ['test/**/*.test.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      // Cover the JavaScript business logic (background scripts, lib,
      // helpers). Preact JSX components are quality-controlled via
      // snapshot tests under test/components/ — v8's "branch" metric
      // counts each `{x && <Y/>}` conditional render as a branch, so
      // chasing branch coverage in JSX leads to writing test prose with
      // no real value. Snapshot diffs catch render regressions better.
      include: ['src/**/*.js'],
      exclude: [
        '**/*.test.{js,jsx}',
        '**/__snapshots__/**',
        // JSX components — see comment above; snapshot tests are the
        // right tool, not branch coverage.
        'src/**/*.jsx',
        // Per-page DOM extractor + script wrapper. Heavy DOM surface;
        // tested indirectly via test/content/extractor-classify.test.js
        // (already covers the load-bearing branches).
        'src/content/content-script.js',
        'src/content/extractor.js',
        // Top-level page script that runs imperatively on options page
        // load. Testing it requires simulating the full DOM lifecycle;
        // covered by manual smoke test of the loaded extension.
        'src/options/options.js',
        // helpers extracted from Panel.jsx by the refactor in progress
        // — not yet tested.
        'src/content/panel/level-data.js',
      ],
      reporter: ['text-summary', 'text'],
    },
  },
});

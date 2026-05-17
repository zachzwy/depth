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
  },
});

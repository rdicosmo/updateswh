import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'extension',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/main.js'),
      output: {
        format: 'iife',
        entryFileNames: 'updateswh.js',
        inlineDynamicImports: true
      },
      external: []
    },
    minify: false, // Keep readable for debugging
    sourcemap: false
  },
  define: {
    'global': 'globalThis'
  },
  // jQuery is loaded separately in the manifest, so we don't bundle it
  // It will be available as $ in the browser context
});


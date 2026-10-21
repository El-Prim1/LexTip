import path from 'node:path';
import { build } from 'vite';

const root = process.cwd();

await build({
  configFile: false,
  root,
  build: {
    emptyOutDir: false,
    outDir: path.join(root, 'extension', 'background'),
    rollupOptions: {
      input: path.join(root, 'src', 'nlp', 'extension-entry.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'nlp-runtime.js',
        inlineDynamicImports: true,
      },
    },
  },
});

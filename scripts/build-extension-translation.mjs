import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

const root = process.cwd();
const outputDirectory = path.join(root, 'extension', 'experiments', 'local-translation');
const assetDirectory = path.join(outputDirectory, 'assets');
const onnxRuntimeDirectory = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const assetSuffix = 'ort-wasm-simd-threaded.asyncify';

await fs.mkdir(assetDirectory, { recursive: true });
await fs.copyFile(
  path.join(onnxRuntimeDirectory, `${assetSuffix}.mjs`),
  path.join(assetDirectory, `${assetSuffix}.mjs`),
);

await build({
  configFile: false,
  root,
  build: {
    emptyOutDir: false,
    outDir: outputDirectory,
    rollupOptions: {
      input: path.join(root, 'src', 'extension-translation', 'runtime.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'transformers-runtime.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});

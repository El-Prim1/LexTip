import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appContent = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const serviceWorker = fs.readFileSync(
  path.join(root, 'extension', 'background', 'service-worker.js'),
  'utf8',
);

assert.match(appContent, /from ['"]\.\/dictionary-service['"]/, 'App uses the dictionary service facade');
assert.match(appContent, /await lookupWord\(text\)/, 'App routes selected text through dictionary lookup');
assert.match(serviceWorker, /lookupWord\(text\)/, 'service worker routes messages through dictionary lookup');
assert.match(serviceWorker, /latencyMs:/, 'service worker returns latency telemetry');

console.log('Phase 2.4 current-architecture verification passed.');

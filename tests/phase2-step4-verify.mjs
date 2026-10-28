import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contentScript = fs.readFileSync(
  path.join(root, 'extension', 'content', 'content-script.js'),
  'utf8',
);
const serviceWorker = fs.readFileSync(
  path.join(root, 'extension', 'background', 'service-worker.js'),
  'utf8',
);

assert.match(contentScript, /window\.getSelection\(\)/, 'content script reads selected browser text');
assert.match(contentScript, /type: 'TRANSLATE_REQUEST'/, 'content script requests a translation');
assert.match(serviceWorker, /message\.type === 'TRANSLATE_REQUEST'/, 'service worker handles selection requests');
assert.match(serviceWorker, /lookupWord\(text\)/, 'service worker routes messages through dictionary lookup');
assert.match(serviceWorker, /latencyMs:/, 'service worker returns latency telemetry');

console.log('Extension selection-to-lookup verification passed.');

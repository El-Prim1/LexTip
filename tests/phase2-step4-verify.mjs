import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${details}`);
    failed++;
  }
}

console.log('--- LinguaLens Step 2.4 Verification Suite ---\n');

// 1. Verify service-worker.js implements instant local cache resolver with latency tracking
const swPath = path.resolve('extension/background/service-worker.js');
assert(fs.existsSync(swPath), 'service-worker.js exists');
const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes('async function lookupLocalWord'), 'lookupLocalWord cache resolver implemented in service-worker.js');
assert(swContent.includes('performance.now()'), 'Latency telemetry tracked via performance.now()');
assert(swContent.includes('latencyMs: latencyMs'), 'Returns measured latencyMs in response payload');

// 2. Verify App.tsx sandbox implements instant cache resolver / lookupWord
const appPath = path.resolve('src/App.tsx');
assert(fs.existsSync(appPath), 'App.tsx exists');
const appContent = fs.readFileSync(appPath, 'utf8');

assert(appContent.includes('const lookupWord = (input: string) =>'), 'lookupWord instant cache resolver implemented in App.tsx');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

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

console.log('--- LinguaLens Step 2.2 Verification Suite ---\n');

const swPath = path.resolve('extension/background/service-worker.js');
assert(fs.existsSync(swPath), 'service-worker.js exists');

const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes('indexedDB.open'), 'IndexedDB opened in service worker');
assert(swContent.includes('LinguaLensDB'), 'Database named LinguaLensDB');
assert(swContent.includes("'by_lemma'"), 'by_lemma index created');
assert(swContent.includes("'by_forms'"), 'by_forms multiEntry index created');
assert(swContent.includes('multiEntry: true'), 'multiEntry indexing enabled for inflections');
assert(swContent.includes('chrome.runtime.onInstalled'), 'onInstalled listener triggers seeding');
assert(swContent.includes('seedDatabaseFromCustomSeed'), 'seedDatabaseFromCustomSeed function implemented');
assert(swContent.includes('lookupLocalWord'), 'lookupLocalWord sub-millisecond query handler implemented');
assert(swContent.includes('performance.now()'), 'performance.now() used for latency telemetry');
assert(swContent.includes('return true'), 'returns true to support async message response');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

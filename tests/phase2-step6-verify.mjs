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

console.log('--- LinguaLens Step 2.6 Lemmatization & Silent E Restoration Verification Suite ---\n');

// 1. Verify service-worker.js lemmatization logic
const swPath = path.resolve('extension/background/service-worker.js');
assert(fs.existsSync(swPath), 'service-worker.js exists');
const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes("candidates.push(word.slice(0, -3) + 'e')"), 'service-worker.js handles silent e restoration for -ing');
assert(swContent.includes("candidates.push(word.slice(0, -1))"), 'service-worker.js handles -s for 3rd person singular');

// 2. Verify App.tsx lemmatization logic
const appPath = path.resolve('src/App.tsx');
assert(fs.existsSync(appPath), 'App.tsx exists');
const appContent = fs.readFileSync(appPath, 'utf8');

assert(appContent.includes("candidates.push(word.slice(0, -3) + 'e')"), 'App.tsx handles silent e restoration for -ing');
assert(appContent.includes("candidates.push(word.slice(0, -1))"), 'App.tsx handles -s for 3rd person singular');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

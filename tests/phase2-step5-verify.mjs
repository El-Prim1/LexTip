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

console.log('--- LinguaLens Step 2.5 Conditional Popup Formatting Verification Suite ---\n');

// 1. Verify conditional formatting logic in content-script.js
const csPath = path.resolve('extension/content/content-script.js');
assert(fs.existsSync(csPath), 'content-script.js exists');
const csContent = fs.readFileSync(csPath, 'utf8');

assert(csContent.includes('cleanLemma === cleanSelected'), 'content-script.js checks if cleanLemma matches cleanSelected');
assert(csContent.includes('sourceEl.textContent = selectedWord || lemma'), 'content-script.js formats simply as word when base form matches selected word');

// 2. Verify conditional formatting logic in App.tsx
const appPath = path.resolve('src/App.tsx');
assert(fs.existsSync(appPath), 'App.tsx exists');
const appContent = fs.readFileSync(appPath, 'utf8');

assert(appContent.includes('cleanLemma === cleanSelected'), 'App.tsx checks if cleanLemma matches cleanSelected');
assert(appContent.includes('source.textContent = selectedWord || lemma'), 'App.tsx formats simply as word when base form matches selected word');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

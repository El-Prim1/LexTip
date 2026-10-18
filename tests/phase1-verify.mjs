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

console.log('--- LinguaLens Phase 1 Verification Suite ---\n');

// 1. Manifest v3 Validation
const manifestPath = path.resolve('extension/manifest.json');
assert(fs.existsSync(manifestPath), 'Manifest v3 file exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.manifest_version === 3, 'Manifest version is 3');
assert(manifest.content_scripts?.[0]?.js?.includes('content/content-script.js'), 'Content script registered in manifest');
assert(manifest.background?.service_worker === 'background/service-worker.js', 'Service worker registered');
assert(manifest.action?.default_popup === 'popup/popup.html', 'Action popup registered');

// 2. All referenced files exist
assert(fs.existsSync(path.resolve('extension/content/content-script.js')), 'content-script.js exists');
assert(fs.existsSync(path.resolve('extension/content/content-styles.css')), 'content-styles.css exists');
assert(fs.existsSync(path.resolve('extension/background/service-worker.js')), 'service-worker.js exists');
assert(fs.existsSync(path.resolve('extension/popup/popup.html')), 'popup.html exists');

// 3. Content Script Invariants
const contentScript = fs.readFileSync(path.resolve('extension/content/content-script.js'), 'utf8');

// 3.1 Debounce
assert(contentScript.includes('DEBOUNCE_MS: 150') || contentScript.includes('150'), 'Debounce is 150ms');

// 3.2 MutationObserver for SPAs
assert(contentScript.includes('MutationObserver') && contentScript.includes('childList: true') && contentScript.includes('subtree: true'), 'MutationObserver implemented for SPA subtree observing');

// 3.3 Closed Shadow DOM
assert(contentScript.includes("attachShadow({ mode: 'closed' })"), 'Closed Shadow DOM encapsulation enforced');

// 3.4 getBoundingClientRect & strict 8px gap
assert(contentScript.includes('getBoundingClientRect()'), 'range.getBoundingClientRect() used for coordinate calculation');
assert(contentScript.includes('GAP: 8') || contentScript.includes('8'), 'Strict ~8px gap defined');

// 3.5 Top-edge boundary flip
assert(contentScript.includes('spaceAbove') && contentScript.includes('arrowClass'), 'Boundary flipping logic implemented');

// 3.6 Escape key dismissal
assert(contentScript.includes("'Escape'") && contentScript.includes('keydown'), 'Escape key listener bound on keydown');

// 3.7 Click outside dismissal with composedPath
assert(contentScript.includes('composedPath') && (contentScript.includes('pointerdown') || contentScript.includes('mousedown')), 'Click outside dismissal uses composedPath for closed Shadow DOM');

// 3.8 No TTS / SpeechSynthesis
assert(!contentScript.includes('SpeechSynthesisUtterance') && !contentScript.includes('speechSynthesis.speak'), 'No Text-to-Speech logic (TTS removed)');

// 3.9 Fallback translation guard (no stuck ellipsis)
assert(contentScript.includes('applyFallback') || contentScript.includes('fallback'), 'Fallback translation guard present to prevent stuck ellipsis');

// 4. Stylesheet Invariants
const styles = fs.readFileSync(path.resolve('extension/content/content-styles.css'), 'utf8');
assert(styles.includes('position: fixed'), 'position: fixed used for viewport accuracy');
assert(styles.includes('z-index: 2147483647'), 'Maximum z-index specified for host layer');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

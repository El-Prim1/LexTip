import { lemmatize, normalizeSelection, generateLemmaCandidates } from '../src/lemmatizer.js';

let passed = 0;
let failed = 0;

function assertEqual(actual: string, expected: string, testName: string) {
  if (actual === expected) {
    console.log(`[PASS] ${testName}: "${actual}" === "${expected}"`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: got "${actual}", expected "${expected}"`);
    failed++;
  }
}

console.log('--- Bug Reproduction Test Suite ---\n');

// Bug 1: Line 192 - Redundant conditional (should work but code is redundant)
// This should pass even with the bug, but the code is inefficient
assertEqual(lemmatize('debouncing'), 'debounce', 'Bug 1: debouncing -> debounce (redundant check)');
assertEqual(lemmatize('dancing'), 'dance', 'Bug 1: dancing -> dance (redundant check)');

// Bug 2: Lines 326-332 - Incorrect -es handling for vowel case
assertEqual(lemmatize('goes'), 'go', 'Bug 2: goes -> go (vowel before e)');
assertEqual(lemmatize('does'), 'do', 'Bug 2: does -> do (vowel before e)');
assertEqual(lemmatize('toes'), 'toe', 'Bug 2: toes -> toe (vowel before e)');
assertEqual(lemmatize('shoes'), 'shoe', 'Bug 2: shoes -> shoe (vowel before e)');

// Bug 3: Line 157 - Length check consistency (should work, just inconsistent)
assertEqual(lemmatize('dying'), 'die', 'Bug 3: dying -> die (length check)');
assertEqual(lemmatize('lying'), 'lie', 'Bug 3: lying -> lie (length check)');

// Bug 4: Line 257 - 'led' handling edge cases
assertEqual(lemmatize('handled'), 'handle', 'Bug 4: handled -> handle (consonant + le)');
assertEqual(lemmatize('settled'), 'settle', 'Bug 4: settled -> settle (consonant + le)');
assertEqual(lemmatize('belled'), 'bell', 'Bug 4: belled -> bell (should not add e)');
assertEqual(lemmatize('killed'), 'kill', 'Bug 4: killed -> kill (double l check)');

// Bug 5: Missing protected suffixes
assertEqual(lemmatize('action'), 'action', 'Bug 5: action -> action (should not strip -tion)');
assertEqual(lemmatize('vision'), 'vision', 'Bug 5: vision -> vision (should not strip -sion)');
assertEqual(lemmatize('moment'), 'moment', 'Bug 5: moment -> moment (should not strip -ment)');
assertEqual(lemmatize('nation'), 'nation', 'Bug 5: nation -> nation (should not strip -tion)');

// Bug 6: generateLemmaCandidates uses original word instead of normalized
assertEqual(generateLemmaCandidates('  Walking  ')[0], 'walk', 'Bug 6: generateLemmaCandidates with whitespace');
assertEqual(generateLemmaCandidates('Walking')[0], 'walk', 'Bug 6: generateLemmaCandidates normal case');
assertEqual(generateLemmaCandidates('"Walking"')[0], 'walk', 'Bug 6: generateLemmaCandidates with quotes');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

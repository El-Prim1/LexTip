import { lemmatize, normalizeSelection } from '../src/lemmatizer.js';

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

console.log('--- Step 1: Lemmatizer Verification Suite ---\n');

// Normalization & Edge Trimming
assertEqual(normalizeSelection('  "Management," '), 'management', 'Edge punctuation & whitespace trimming');
assertEqual(normalizeSelection('((ensures))'), 'ensures', 'Parentheses trimming');
assertEqual(normalizeSelection('“debouncing”'), 'debouncing', 'Unicode curly quotes trimming');

// Level 1: Irregular Forms & Invariant Map
assertEqual(lemmatize('went'), 'go', 'Irregular verb: went -> go');
assertEqual(lemmatize('bought'), 'buy', 'Irregular verb: bought -> buy');
assertEqual(lemmatize('written'), 'write', 'Irregular verb: written -> write');
assertEqual(lemmatize('running'), 'run', 'Irregular form: running -> run');
assertEqual(lemmatize('children'), 'child', 'Irregular plural: children -> child');
assertEqual(lemmatize('teeth'), 'tooth', 'Irregular plural: teeth -> tooth');
assertEqual(lemmatize('feet'), 'foot', 'Irregular plural: feet -> foot');
assertEqual(lemmatize('men'), 'man', 'Irregular plural: men -> man');
assertEqual(lemmatize('news'), 'news', 'Invariant -s: news -> news');
assertEqual(lemmatize('series'), 'series', 'Invariant -s: series -> series');
assertEqual(lemmatize('species'), 'species', 'Invariant -s: species -> species');
assertEqual(lemmatize('status'), 'status', 'Invariant -s: status -> status');
assertEqual(lemmatize('means'), 'means', 'Invariant -s: means -> means');

// Level 2: Protected Suffix Guard
assertEqual(lemmatize('process'), 'process', 'Protected suffix: -ss (process)');
assertEqual(lemmatize('focus'), 'focus', 'Protected suffix: -us (focus)');
assertEqual(lemmatize('analysis'), 'analysis', 'Protected suffix: -is (analysis)');
assertEqual(lemmatize('serious'), 'serious', 'Protected suffix: -ous (serious)');
assertEqual(lemmatize('linguistics'), 'linguistics', 'Protected suffix: -ics (linguistics)');
assertEqual(lemmatize('chaos'), 'chaos', 'Protected suffix: -os (chaos)');

// Level 3: Morphological Rule Pipeline - '-ing'
assertEqual(lemmatize('dying'), 'die', '-ying to -ie: dying -> die');
assertEqual(lemmatize('lying'), 'lie', '-ying to -ie: lying -> lie');
assertEqual(lemmatize('stopping'), 'stop', 'Doubled consonant: stopping -> stop');
assertEqual(lemmatize('flipping'), 'flip', 'Doubled consonant: flipping -> flip');
assertEqual(lemmatize('running'), 'run', 'Doubled consonant / irregular: running -> run');
assertEqual(lemmatize('calling'), 'call', 'Double l exclusion: calling -> call');
assertEqual(lemmatize('falling'), 'fall', 'Double l exclusion: falling -> fall');
assertEqual(lemmatize('debouncing'), 'debounce', 'Silent e restoration: debouncing -> debounce');
assertEqual(lemmatize('dancing'), 'dance', 'Silent e restoration: dancing -> dance');
assertEqual(lemmatize('making'), 'make', 'CVC silent e: making -> make');
assertEqual(lemmatize('walking'), 'walk', 'Standard -ing stripping: walking -> walk');

// Level 3: Morphological Rule Pipeline - '-ed'
assertEqual(lemmatize('carried'), 'carry', '-ied to -y: carried -> carry');
assertEqual(lemmatize('stopped'), 'stop', 'Doubled consonant: stopped -> stop');
assertEqual(lemmatize('planned'), 'plan', 'Doubled consonant: planned -> plan');
assertEqual(lemmatize('chilled'), 'chill', 'Double l exclusion: chilled -> chill');
assertEqual(lemmatize('spilled'), 'spill', 'Double l exclusion: spilled -> spill');
assertEqual(lemmatize('saved'), 'save', 'Silent e restoration: saved -> save');
assertEqual(lemmatize('created'), 'create', 'Silent e restoration: created -> create');
assertEqual(lemmatize('punctuated'), 'punctuate', '-ated silent e: punctuated -> punctuate');
assertEqual(lemmatize('navigated'), 'navigate', '-ated silent e: navigated -> navigate');
assertEqual(lemmatize('executed'), 'execute', '-uted silent e: executed -> execute');
assertEqual(lemmatize('united'), 'unite', '-ited silent e: united -> unite');
assertEqual(lemmatize('organized'), 'organize', '-ized silent e: organized -> organize');
assertEqual(lemmatize('produced'), 'produce', '-uced silent e: produced -> produce');
assertEqual(lemmatize('walked'), 'walk', 'Standard -ed stripping: walked -> walk');
assertEqual(lemmatize('helped'), 'help', 'Standard -ed stripping for consonant cluster: helped -> help');
assertEqual(lemmatize('cleaned'), 'clean', 'Standard -ed stripping for double vowel: cleaned -> clean');


// Level 3: Morphological Rule Pipeline - '-s' / '-es'
assertEqual(lemmatize('boundaries'), 'boundary', '-ies to -y: boundaries -> boundary');
assertEqual(lemmatize('categories'), 'category', '-ies to -y: categories -> category');
assertEqual(lemmatize('watches'), 'watch', 'Sibilant cluster -es: watches -> watch');
assertEqual(lemmatize('boxes'), 'box', 'Sibilant cluster -es: boxes -> box');
assertEqual(lemmatize('processes'), 'process', 'Sibilant cluster -es: processes -> process');
assertEqual(lemmatize('coordinates'), 'coordinate', 'Other consonant + silent e: coordinates -> coordinate');
assertEqual(lemmatize('causes'), 'cause', 'Other consonant + silent e: causes -> cause');
assertEqual(lemmatize('ensures'), 'ensure', 'Other consonant + silent e: ensures -> ensure');
assertEqual(lemmatize('notes'), 'note', 'Silent e preservation: notes -> note');
assertEqual(lemmatize('changes'), 'change', 'Silent e preservation: changes -> change');
assertEqual(lemmatize('cats'), 'cat', 'Standard -s stripping: cats -> cat');
assertEqual(lemmatize('singing'), 'sing', 'Standard -ing stripping for non-CVC root: singing -> sing');

// UI Integration & Formatting
import { formatDisplayResult } from '../src/lemmatizer.js';
assertEqual(
  formatDisplayResult('cat', 'cat', 'кот'),
  'cat — кот',
  'UI Formatting: matching base form'
);
assertEqual(
  formatDisplayResult('cats', 'cat', 'кот'),
  'cat (cats) — кот',
  'UI Formatting: differing base form'
);
assertEqual(
  formatDisplayResult('  "Ensures"  ', 'ensure', 'гарантирует'),
  'ensure (ensures) — гарантирует',
  'UI Formatting: edge punctuation and case-insensitive check'
);
assertEqual(
  formatDisplayResult('unknown', 'unknown', null),
  'unknown — Translation not found',
  'UI Formatting: not found in DB with matching base form'
);
assertEqual(
  formatDisplayResult('unknowns', 'unknown', null),
  'unknown (unknowns) — Translation not found',
  'UI Formatting: not found in DB with differing base form'
);
assertEqual(
  formatDisplayResult('unknown', 'unknown', 'Translation not found'),
  'unknown — Translation not found',
  'UI Formatting: Translation not found string fallback'
);


console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

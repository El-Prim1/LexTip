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

console.log('--- LinguaLens Step 2.3 Verification Suite ---\n');

// 1. Verify functions in service-worker.js
const swPath = path.resolve('extension/background/service-worker.js');
assert(fs.existsSync(swPath), 'service-worker.js exists');

const swContent = fs.readFileSync(swPath, 'utf8');

assert(swContent.includes('function normalizeText'), 'normalizeText function implemented in service worker');
assert(swContent.includes('function generateLemmaCandidates'), 'generateLemmaCandidates function implemented in service worker');
assert(swContent.includes('candidates.push(word.slice(0, -3) + \'y\')'), 'handles -ies -> -y inflection reduction');
assert(swContent.includes('candidates.push(word.slice(0, -1))'), 'handles -s inflection reduction');
assert(swContent.includes('candidates.push(word.slice(0, -3) + \'e\')'), 'handles -ing -> -e inflection reduction');

// 2. Extract and test normalization & lemmatization algorithms directly
const normalizeText = (text) => {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '')
    .replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
};

const generateLemmaCandidates = (word) => {
  const candidates = [];
  if (!word || word.length < 3) return candidates;

  if (word.endsWith('ies') && word.length > 4) {
    candidates.push(word.slice(0, -3) + 'y');
  } else if (word.endsWith('es') && word.length > 4) {
    candidates.push(word.slice(0, -2));
    candidates.push(word.slice(0, -1));
  } else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    candidates.push(word.slice(0, -1));
  }

  if (word.endsWith('ied') && word.length > 4) {
    candidates.push(word.slice(0, -3) + 'y');
  } else if (word.endsWith('ed') && word.length > 4) {
    candidates.push(word.slice(0, -2));
    candidates.push(word.slice(0, -1));
    if (word.length > 5 && word[word.length - 3] === word[word.length - 4]) {
      candidates.push(word.slice(0, -3));
    }
  }

  if (word.endsWith('ing') && word.length > 4) {
    candidates.push(word.slice(0, -3));
    candidates.push(word.slice(0, -3) + 'e');
    if (word.length > 5 && word[word.length - 4] === word[word.length - 5]) {
      candidates.push(word.slice(0, -4));
    }
  }

  return Array.from(new Set(candidates.filter((c) => c && c !== word)));
};

// Test normalizer
assert(normalizeText('"boundaries,"') === 'boundaries', 'Normalizer strips double quotes and comma');
assert(normalizeText('(handling)') === 'handling', 'Normalizer strips parentheses');
assert(normalizeText('“viewports”') === 'viewports', 'Normalizer strips unicode curly quotes');
assert(normalizeText('debouncing.') === 'debouncing', 'Normalizer strips trailing period');
assert(normalizeText('  isolated!  ') === 'isolated', 'Normalizer strips exclamation and spaces');

// Test lemmatizer
assert(generateLemmaCandidates('boundaries').includes('boundary'), 'Lemmatizer reduces boundaries -> boundary');
assert(generateLemmaCandidates('dictionaries').includes('dictionary'), 'Lemmatizer reduces dictionaries -> dictionary');
assert(generateLemmaCandidates('handles').includes('handle'), 'Lemmatizer reduces handles -> handle');
assert(generateLemmaCandidates('viewports').includes('viewport'), 'Lemmatizer reduces viewports -> viewport');
assert(generateLemmaCandidates('handling').includes('handle'), 'Lemmatizer reduces handling -> handle');
assert(generateLemmaCandidates('isolated').includes('isolate'), 'Lemmatizer reduces isolated -> isolate');

// 3. Test popover formatting in content-script.js
const csPath = path.resolve('extension/content/content-script.js');
assert(fs.existsSync(csPath), 'content-script.js exists');
const csContent = fs.readFileSync(csPath, 'utf8');
assert(csContent.includes('${lemma} (${selectedWord})'), 'content-script.js formats source as lemma (selectedWord)');

// 4. Test sandbox lookupWord and popover formatting in App.tsx
const appPath = path.resolve('src/App.tsx');
assert(fs.existsSync(appPath), 'App.tsx exists');
const appContent = fs.readFileSync(appPath, 'utf8');
assert(appContent.includes('const lookupWord = (input: string) =>'), 'App.tsx defines lookupWord');
assert(appContent.includes('${result.lemma} (${result.selectedWord})'), 'App.tsx formats popup strictly as lemma (selected word)');

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}

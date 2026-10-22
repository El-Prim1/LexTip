import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const dictionaryPath = path.join(root, 'extension', 'dictionaries', 'english-russian-dictionary.json');
const dictionaryData = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'));
const serviceSource = fs.readFileSync(
  path.join(root, 'extension', 'background', 'dictionary-service.js'),
  'utf8',
);
const nlpRuntimeSource = fs.readFileSync(
  path.join(root, 'extension', 'background', 'nlp-runtime.js'),
  'utf8',
);

const context = {
  console,
  performance,
  atob,
  module: { exports: {} },
  chrome: { runtime: { getURL: (file) => file } },
  fetch: async () => ({ json: async () => dictionaryData }),
};

vm.runInNewContext(nlpRuntimeSource, context, { filename: 'nlp-runtime.js' });
vm.runInNewContext(serviceSource, context, { filename: 'dictionary-service.js' });
const { loadDictionary, lookupWord, formatDisplayResult, getDictionaryStats } = context.module.exports;

await loadDictionary();

const stats = getDictionaryStats();
assert.equal(stats.skipped, 0, 'legacy dictionary records load without skips');
assert.ok(stats.loaded > 0, 'legacy dictionary records are indexed');

const exactEntry = dictionaryData.find((entry) => entry.word === 'the');
assert.ok(exactEntry, 'dictionary contains an exact lookup entry');

const exactResult = await lookupWord('the');
assert.equal(exactResult.found, true, 'exact word lookup succeeds');
assert.equal(exactResult.translation, exactEntry.translation, 'exact translation comes from JSON');
assert.equal(exactResult.structured.matchType, 'direct', 'exact lookup reports a direct match');
assert.equal(exactResult.structured.sourceLanguage, 'en', 'structured result preserves source language');
assert.equal(exactResult.structured.targetLanguage, 'ru', 'structured result preserves target language');

const inflectedResult = await lookupWord('handles');
assert.equal(inflectedResult.found, true, 'inflected word lookup uses the NLP lemma');
assert.equal(inflectedResult.lemma, 'handle', 'inflected word resolves to its lemma');

const possessiveResult = await lookupWord("government's");
assert.equal(possessiveResult.found, true, 'possessive lookup uses the base word');
assert.equal(possessiveResult.lemma, 'government', 'possessive resolves to its base lemma');
assert.equal(possessiveResult.structured.matchType, 'lemma', 'possessive lookup reports a lemma match');

const missingResult = await lookupWord('word-not-in-dictionary');
assert.equal(missingResult.found, false, 'unknown word reports a miss');
assert.equal(
  formatDisplayResult('word-not-in-dictionary', missingResult.translation),
  'word-not-in-dictionary — Translation not found',
  'missing word uses the required fallback format',
);

console.log('Dictionary integration tests passed.');

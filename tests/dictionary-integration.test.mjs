import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const dictionaryPath = path.join(root, 'extension', 'dictionaries', 'english-russian-dictionary.json');
const statisticalDictionaryPath = path.join(
  root,
  'extension',
  'dictionaries',
  'statistical-en-russian-dictionary.json',
);
const dictionaryData = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'));
const statisticalDictionaryData = JSON.parse(fs.readFileSync(statisticalDictionaryPath, 'utf8'));
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
  fetch: async (url) => {
    const data = String(url).includes('statistical-en-russian-dictionary')
      ? statisticalDictionaryData
      : dictionaryData;
    return { ok: true, status: 200, json: async () => data };
  },
};

vm.runInNewContext(nlpRuntimeSource, context, { filename: 'nlp-runtime.js' });
vm.runInNewContext(serviceSource, context, { filename: 'dictionary-service.js' });
const { loadDictionary, lookupWord, formatDisplayResult, getDictionaryStats } = context.module.exports;

await loadDictionary();

const stats = getDictionaryStats();
assert.equal(stats.skipped, 0, 'legacy dictionary records load without skips');
assert.ok(stats.loaded > 0, 'legacy dictionary records are indexed');
assert.equal(stats.legacyLoaded, dictionaryData.length, 'all canonical records remain loaded');
assert.equal(stats.statisticalLoaded, statisticalDictionaryData.length, 'all statistical records load');

const exactEntry = dictionaryData.find((entry) => entry.word === 'the');
assert.ok(exactEntry, 'dictionary contains an exact lookup entry');

const exactResult = await lookupWord('the');
assert.equal(exactResult.found, true, 'exact word lookup succeeds');
assert.ok(
  exactResult.translation?.startsWith(`${exactEntry.translation}, `),
  'canonical translation remains first in the expanded result',
);
assert.equal(exactResult.structured.matchType, 'direct', 'exact lookup reports a direct match');
assert.equal(exactResult.structured.sourceLanguage, 'en', 'structured result preserves source language');
assert.equal(exactResult.structured.targetLanguage, 'ru', 'structured result preserves target language');
assert.equal(exactResult.structured.matches[0]?.entry.source, 'legacy-json');

const bookResult = await lookupWord('book');
assert.equal(bookResult.translation, 'книга, книжка, бронирование, забронировать');
assert.equal(bookResult.structured.matches[0]?.entry.source, 'legacy-json');
const bookStatisticalMatches = bookResult.structured.matches.filter(
  (match) => match.entry.source === 'statistical-dataset',
);
assert.deepEqual(
  Array.from(bookStatisticalMatches, (match) => match.entry.senses[0].translations[0].text),
  ['бронирование', 'забронировать'],
);
assert.deepEqual(
  Array.from(bookStatisticalMatches, (match) => match.entry.senses[0].translations[0].probability),
  [0.051, 0.0297],
);

const abilityResult = await lookupWord('ability');
assert.equal(
  abilityResult.translation,
  'способность, умение, возможность',
  'imported alternatives already present in comma-separated legacy values are not repeated',
);
assert.equal(abilityResult.structured.matches[0]?.entry.source, 'legacy-json');

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

const fallbackContext = {
  console: { log() {}, error() {} },
  performance,
  atob,
  module: { exports: {} },
  chrome: { runtime: { getURL: (file) => file } },
  fetch: async (url) => {
    if (String(url).includes('statistical-en-russian-dictionary')) {
      throw new Error('simulated missing supplemental asset');
    }
    return { ok: true, status: 200, json: async () => dictionaryData };
  },
};
vm.runInNewContext(nlpRuntimeSource, fallbackContext, { filename: 'nlp-runtime-fallback.js' });
vm.runInNewContext(serviceSource, fallbackContext, { filename: 'dictionary-service-fallback.js' });
const fallbackService = fallbackContext.module.exports;
await fallbackService.loadDictionary();
assert.equal(
  fallbackService.getDictionaryStats().legacyLoaded,
  dictionaryData.length,
  'canonical dictionary remains available when the supplemental asset fails',
);
assert.equal((await fallbackService.lookupWord('the')).found, true);

console.log('Dictionary integration tests passed.');

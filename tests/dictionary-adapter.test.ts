import assert from 'node:assert/strict';
import { adaptLegacyDictionary, normalizeDictionaryKey } from '../src/dictionary/legacy-adapter.js';

const records = [
  { word: ' Bank ', translation: 'банк' },
  { word: 'take off', translation: 'взлетать' },
  { word: 'bank', translation: 'берег' },
  { word: '', translation: 'invalid' },
  { word: 'missing translation', translation: '   ' },
];

const first = adaptLegacyDictionary(records);
const second = adaptLegacyDictionary(records);

assert.equal(normalizeDictionaryKey('  Take   Off  '), 'take off');
assert.equal(first.entries.length, 3);
assert.equal(first.skipped.length, 2);
assert.deepEqual(first.entries.map((entry) => entry.id), second.entries.map((entry) => entry.id));

const bankEntries = first.entries.filter((entry) => entry.lemma === 'bank');
assert.equal(bankEntries.length, 2);
assert.ok(bankEntries.every((entry) => entry.entryType === 'word'));
assert.ok(bankEntries.every((entry) => entry.partOfSpeech === 'UNKNOWN'));
assert.ok(bankEntries.every((entry) => entry.verificationStatus === 'unverified'));
assert.deepEqual(bankEntries.map((entry) => entry.senses[0].translations[0].text), ['банк', 'берег']);

const phrase = first.entries.find((entry) => entry.lemma === 'take off');
assert.equal(phrase?.entryType, 'phrase');
assert.equal(phrase?.sourceLanguage, 'en');
assert.equal(phrase?.targetLanguage, 'ru');

console.log('Dictionary adapter tests passed.');

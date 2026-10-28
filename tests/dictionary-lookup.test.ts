import assert from 'node:assert/strict';
import { lookupTranslation } from '../src/dictionary/lookup-service.js';
import { STATISTICAL_DICTIONARY_SOURCE } from '../src/dictionary/model.js';
import { InMemoryDictionaryRepository } from '../src/dictionary/repository.js';
import { dictionaryFixture } from './fixtures/dictionary-fixture.js';

const repository = new InMemoryDictionaryRepository(dictionaryFixture);
const statisticalEntries = [
  {
    ...dictionaryFixture[0],
    id: 'bank-statistical-lower',
    source: STATISTICAL_DICTIONARY_SOURCE,
    senses: [{
      id: 'bank-statistical-lower:sense-1',
      translations: [{
        id: 'bank-statistical-lower:translation',
        text: 'банковский',
        probability: 0.2,
        count: 40,
      }],
    }],
  },
  {
    ...dictionaryFixture[0],
    id: 'bank-statistical-higher',
    source: STATISTICAL_DICTIONARY_SOURCE,
    senses: [{
      id: 'bank-statistical-higher:sense-1',
      translations: [{
        id: 'bank-statistical-higher:translation',
        text: 'банк',
        probability: 0.8,
        count: 30,
      }],
    }],
  },
];
const rankedRepository = new InMemoryDictionaryRepository([
  ...dictionaryFixture,
  ...statisticalEntries,
]);

const rankedBank = lookupTranslation(rankedRepository, 'bank', 'en', 'ru');
assert.equal(rankedBank.found, true);
if (rankedBank.found) {
  assert.deepEqual(
    rankedBank.matches.map((match) => match.entry.id),
    ['bank-finance', 'bank-river', 'bank-statistical-higher', 'bank-statistical-lower'],
  );
}

const bank = lookupTranslation(repository, '  BANK!  ', 'en', 'ru');
assert.equal(bank.found, true);
if (bank.found) {
  assert.equal(bank.matchType, 'direct');
  assert.equal(bank.originalText, '  BANK!  ');
  assert.equal(bank.matches.length, 2);
  assert.deepEqual(
    bank.matches.flatMap((match) => match.entry.senses[0].translations.map((translation) => translation.text)),
    ['банк', 'берег'],
  );
}

const phrase = lookupTranslation(repository, ' take   off ', 'en', 'ru');
assert.equal(phrase.found, true);
if (phrase.found) {
  assert.equal(phrase.matchType, 'phrase');
  assert.equal(phrase.matches[0]?.entry.id, 'take-off');
}

assert.equal(lookupTranslation(repository, 'take on', 'en', 'ru').found, false);
assert.equal(lookupTranslation(repository, 'livre', 'en', 'ru').found, false);
assert.equal(lookupTranslation(repository, '   ', 'en', 'ru').found, false);

const saw = lookupTranslation(repository, 'saw', 'en', 'ru');
assert.equal(saw.found, true);
if (saw.found) {
  assert.equal(saw.ambiguous, true);
  assert.deepEqual(
    new Set(saw.lemmaCandidates.map((candidate) => candidate.lemma)),
    new Set(['saw', 'see']),
  );
  assert.equal(saw.matches.length, 2);
}

const contextualSaw = lookupTranslation(repository, 'saw', 'en', 'ru', {
  analysis: {
    surface: 'saw',
    normalized: 'saw',
    lemma: 'see',
    partOfSpeech: 'VERB',
    start: 0,
    end: 3,
    source: 'curated',
    candidates: [],
    ambiguous: false,
  },
});
assert.equal(contextualSaw.found, true);
if (contextualSaw.found) {
  assert.equal(contextualSaw.matches[0]?.entry.id, 'saw-verb');
}

console.log('Dictionary lookup tests passed.');

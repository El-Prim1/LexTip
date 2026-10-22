import assert from 'node:assert/strict';
import { InMemoryDictionaryRepository } from '../src/dictionary/repository.js';
import { dictionaryFixture } from './fixtures/dictionary-fixture.js';

const repository = new InMemoryDictionaryRepository(dictionaryFixture);

assert.equal(repository.findByLemma('bank', 'en', 'ru').length, 2);
assert.equal(repository.findByLemma('book', 'en', 'ru').length, 2);
assert.equal(repository.findByLemma('see', 'en', 'ru')[0]?.id, 'saw-verb');
assert.equal(repository.findByLemma('saw', 'en', 'ru')[0]?.id, 'saw-noun');
assert.equal(repository.findByPhrase('  TAKE   OFF ', 'en', 'ru')[0]?.id, 'take-off');
assert.equal(repository.findByPhrase('take on', 'en', 'ru').length, 0);
assert.equal(repository.findByLemma('livre', 'fr', 'ru')[0]?.id, 'livre-fr-ru');
assert.equal(repository.findByLemma('livre', 'en', 'ru').length, 0);
assert.equal(repository.getEntries('en', 'ru').length, 7);

const duplicateRepository = new InMemoryDictionaryRepository([
  ...dictionaryFixture,
  dictionaryFixture[0],
]);
assert.equal(duplicateRepository.findByLemma('bank', 'en', 'ru').length, 2);

console.log('Dictionary repository tests passed.');

import assert from 'node:assert/strict';
import { analyzeText, analyzeWord, normalizeLookupKey } from '../src/nlp/lemmatization.js';

function lemma(word: string, context?: string): string {
  const result = analyzeWord(word, context);
  assert.ok(result, `Expected an analysis for ${word}`);
  return result.lemma;
}

assert.equal(lemma('studies'), 'study');
assert.equal(lemma('studying'), 'study');
assert.equal(lemma('books'), 'book');
assert.equal(lemma('went'), 'go');
assert.equal(lemma('gone'), 'go');
assert.equal(lemma('children'), 'child');
assert.equal(lemma('mice'), 'mouse');

const verbSaw = analyzeWord('saw', 'I saw him yesterday.');
assert.equal(verbSaw?.lemma, 'see');
assert.equal(verbSaw?.partOfSpeech, 'VERB');

const nounSaw = analyzeWord('saw', 'I bought a saw.');
assert.equal(nounSaw?.lemma, 'saw');
assert.equal(nounSaw?.partOfSpeech, 'NOUN');

const standaloneSaw = analyzeWord('saw');
assert.equal(standaloneSaw?.ambiguous, true);
assert.equal(standaloneSaw?.candidates.length, 2);

const sentence = analyzeText('The students were studying.');
assert.deepEqual(
  sentence.map((token) => token.lemma),
  ['the', 'student', 'be', 'study'],
);
assert.deepEqual(
  sentence.map((token) => token.surface),
  ['The', 'students', 'were', 'studying'],
);
assert.deepEqual(
  sentence.map((token) => [token.start, token.end]),
  [[0, 3], [4, 12], [13, 17], [18, 26]],
);

assert.equal(normalizeLookupKey('  Café   STUDIES  '), 'café studies');
assert.equal(analyzeText('   \t  ').length, 0);

const unknown = analyzeWord('Qzxvword');
assert.equal(unknown?.lemma, 'qzxvword');
assert.equal(unknown?.source, 'fallback');
assert.equal(unknown?.ambiguous, true);

const possessive = analyzeWord("government's");
assert.equal(possessive?.surface, "government's");
assert.equal(possessive?.normalized, 'government');
assert.equal(possessive?.lemma, 'government');

console.log('Lemmatization tests passed.');

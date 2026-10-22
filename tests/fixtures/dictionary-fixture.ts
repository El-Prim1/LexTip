import type { DictionaryEntry } from '../../src/dictionary/model.js';

function entry(
  id: string,
  lemma: string,
  entryType: 'word' | 'phrase',
  partOfSpeech: string,
  translation: string,
  sourceLanguage = 'en',
  targetLanguage = 'ru',
): DictionaryEntry {
  const senseId = `${id}:sense-1`;
  return {
    id,
    sourceLanguage,
    targetLanguage,
    lemma,
    entryType,
    partOfSpeech,
    senses: [{
      id: senseId,
      translations: [{ id: `${senseId}:translation`, text: translation }],
    }],
    source: 'test-fixture',
    verificationStatus: 'verified',
  };
}

export const dictionaryFixture: DictionaryEntry[] = [
  entry('bank-finance', 'bank', 'word', 'NOUN', 'банк'),
  entry('bank-river', 'bank', 'word', 'NOUN', 'берег'),
  entry('book-noun', 'book', 'word', 'NOUN', 'книга'),
  entry('book-verb', 'book', 'word', 'VERB', 'бронировать'),
  entry('saw-verb', 'see', 'word', 'VERB', 'видеть'),
  entry('saw-noun', 'saw', 'word', 'NOUN', 'пила'),
  entry('take-off', 'take off', 'phrase', 'UNKNOWN', 'взлетать'),
  entry('livre-fr-ru', 'livre', 'word', 'NOUN', 'книга', 'fr', 'ru'),
];

/**
 * Compatibility facade for the existing UI.
 * Structured dictionary access lives in src/dictionary/lookup-service.ts.
 */

import dictionaryData from '../extension/dictionaries/english-russian-dictionary.json';
import { analyzeWord, normalizeLookupKey, type WordAnalysis } from './nlp/lemmatization.js';
import { adaptLegacyDictionary } from './dictionary/legacy-adapter.js';
import {
  lookupTranslation,
  type LookupResult as StructuredLookupResult,
} from './dictionary/lookup-service.js';
import { InMemoryDictionaryRepository, type DictionaryRepository } from './dictionary/repository.js';
import type { DictionaryEntry } from './dictionary/model.js';

export interface LookupResult {
  found: boolean;
  translation: string | null;
  selectedWord: string;
  lemma: string;
  partOfSpeech: string | null;
  analysis: WordAnalysis | null;
  structured: StructuredLookupResult;
}

const adaptedDictionary = adaptLegacyDictionary(dictionaryData);
const dictionaryRepository: DictionaryRepository = new InMemoryDictionaryRepository(adaptedDictionary.entries);

export const dictionaryLoadStats = {
  loaded: adaptedDictionary.entries.length,
  skipped: adaptedDictionary.skipped.length,
};

export function getDictionaryRepository(): DictionaryRepository {
  return dictionaryRepository;
}

export async function loadDictionary(): Promise<DictionaryRepository> {
  return dictionaryRepository;
}

function flattenTranslations(result: StructuredLookupResult): string | null {
  if (!result.found) return null;

  const translations = result.matches.flatMap((match) => (
    match.entry.senses.flatMap((sense) => sense.translations.map((translation) => translation.text))
  ));
  return [...new Set(translations)].join(', ') || null;
}

export async function lookupWord(word: string): Promise<LookupResult> {
  await loadDictionary();

  const analysis = analyzeWord(word);
  const structured = lookupTranslation(dictionaryRepository, word, 'en', 'ru', { analysis });
  const selectedWord = normalizeLookupKey(word);
  const firstMatch = structured.found ? structured.matches[0] : undefined;

  return {
    found: structured.found,
    translation: flattenTranslations(structured),
    selectedWord,
    lemma: firstMatch?.lemma ?? analysis?.lemma ?? selectedWord,
    partOfSpeech: firstMatch?.partOfSpeech ?? analysis?.partOfSpeech ?? null,
    analysis,
    structured,
  };
}

export function formatDisplayResult(selectedWord: string, translation?: string | null): string {
  const cleanSelected = selectedWord.trim().toLowerCase();
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;

  return `${cleanSelected} — ${targetTranslation}`;
}

export type { DictionaryEntry };

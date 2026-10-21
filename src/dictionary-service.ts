/**
 * LinguaLens - Dictionary Service (TypeScript)
 * Loads and indexes the English-Russian dictionary for O(1) lookups
 * Integrates with the lemmatization pipeline
 */

import dictionaryData from '../extension/dictionaries/english-russian-dictionary.json';
import { analyzeWord, normalizeLookupKey, type WordAnalysis } from './nlp/lemmatization';
import type { PartOfSpeech } from 'wink-nlp';

interface DictionaryEntry {
  word: string;
  translation: string;
}

interface LookupResult {
  found: boolean;
  translation: string | null;
  selectedWord: string;
  lemma: string;
  partOfSpeech: PartOfSpeech | null;
  analysis: WordAnalysis | null;
}

const dictionaryMap = new Map<string, DictionaryEntry>();

for (const entry of dictionaryData as DictionaryEntry[]) {
  if (entry.word) {
    dictionaryMap.set(entry.word.toLowerCase().trim(), {
      word: entry.word,
      translation: entry.translation,
    });
  }
}

/**
 * Load dictionary from JSON file and build index
 */
export async function loadDictionary(): Promise<Map<string, DictionaryEntry>> {
  return dictionaryMap;
}

/**
 * Lookup word in dictionary with lemmatization fallback
 */
export async function lookupWord(word: string): Promise<LookupResult> {
  await loadDictionary();

  const selectedWord = normalizeLookupKey(word);
  const analysis = analyzeWord(word);
  const lemma = analysis?.lemma ?? selectedWord;
  const entry = dictionaryMap.get(lemma) ?? dictionaryMap.get(selectedWord);

  if (entry) {
    return {
      found: true,
      translation: entry.translation,
      selectedWord,
      lemma,
      partOfSpeech: analysis?.partOfSpeech ?? null,
      analysis,
    };
  }

  return {
    found: false,
    translation: null,
    selectedWord,
    lemma,
    partOfSpeech: analysis?.partOfSpeech ?? null,
    analysis,
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

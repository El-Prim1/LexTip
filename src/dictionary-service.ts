/**
 * LinguaLens - Dictionary Service (TypeScript)
 * Loads and indexes the English-Russian dictionary for O(1) lookups
 * Integrates with the lemmatization pipeline
 */

import { lemmatize, generateLemmaCandidates, formatDisplayResult } from './lemmatizer';
import dictionaryData from '../extension/dictionaries/english-russian-dictionary.json';

interface DictionaryEntry {
  word: string;
  translation: string;
}

interface LookupResult {
  found: boolean;
  translation: string | null;
  lemma: string;
  selectedWord: string;
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

  const candidates = generateLemmaCandidates(word);

  for (const candidate of candidates) {
    const entry = dictionaryMap.get(candidate);
    if (entry) {
      return {
        found: true,
        translation: entry.translation,
        lemma: candidate,
        selectedWord: word.trim().toLowerCase(),
      };
    }
  }

  // Not found
  return {
    found: false,
    translation: null,
    lemma: candidates[0] || word.trim().toLowerCase(),
    selectedWord: word.trim().toLowerCase(),
  };
}

/**
 * Format display result using the shared formatter from lemmatizer
 */
export { formatDisplayResult };

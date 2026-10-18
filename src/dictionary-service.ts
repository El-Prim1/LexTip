/**
 * LinguaLens - Dictionary Service (TypeScript)
 * Loads and indexes the English-Russian dictionary for O(1) lookups
 * Integrates with the lemmatization pipeline
 */

import { lemmatize, generateLemmaCandidates, formatDisplayResult } from './lemmatizer';

interface DictionaryEntry {
  word: string;
  translation: string;
  transcription: string;
}

interface LookupResult {
  found: boolean;
  translation: string | null;
  lemma: string;
  selectedWord: string;
  transcription: string | null;
}

let dictionaryMap: Map<string, DictionaryEntry> | null = null;
let dictionaryLoaded = false;

/**
 * Load dictionary from JSON file and build index
 */
export async function loadDictionary(): Promise<Map<string, DictionaryEntry>> {
  if (dictionaryLoaded && dictionaryMap) {
    return dictionaryMap;
  }

  try {
    const response = await fetch('/extension/dictionaries/english-russian-dictionary.json');
    const dictionaryData: DictionaryEntry[] = await response.json();

    // Build Map for O(1) lookup keyed by word (lowercase)
    dictionaryMap = new Map();
    for (const entry of dictionaryData) {
      if (entry.word) {
        const key = entry.word.toLowerCase().trim();
        dictionaryMap.set(key, {
          word: entry.word,
          translation: entry.translation,
          transcription: entry.transcription,
        });
      }
    }

    dictionaryLoaded = true;
    console.log(`[DictionaryService] Loaded ${dictionaryMap.size} dictionary entries`);
    return dictionaryMap;
  } catch (error) {
    console.error('[DictionaryService] Failed to load dictionary:', error);
    dictionaryMap = new Map();
    dictionaryLoaded = false;
    return dictionaryMap;
  }
}

/**
 * Lookup word in dictionary with lemmatization fallback
 */
export async function lookupWord(word: string): Promise<LookupResult> {
  await loadDictionary();

  const candidates = generateLemmaCandidates(word);

  for (const candidate of candidates) {
    const entry = dictionaryMap?.get(candidate);
    if (entry) {
      return {
        found: true,
        translation: entry.translation,
        lemma: candidate,
        selectedWord: word.trim().toLowerCase(),
        transcription: entry.transcription,
      };
    }
  }

  // Not found
  return {
    found: false,
    translation: null,
    lemma: candidates[0] || word.trim().toLowerCase(),
    selectedWord: word.trim().toLowerCase(),
    transcription: null,
  };
}

/**
 * Format display result using the shared formatter from lemmatizer
 */
export { formatDisplayResult };

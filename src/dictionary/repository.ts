import { normalizeDictionaryKey } from './legacy-adapter.js';
import type { DictionaryEntry } from './model.js';

export interface DictionaryRepository {
  getEntries(sourceLanguage: string, targetLanguage: string): DictionaryEntry[];
  findByLemma(lemma: string, sourceLanguage: string, targetLanguage: string): DictionaryEntry[];
  findByPhrase(phrase: string, sourceLanguage: string, targetLanguage: string): DictionaryEntry[];
}

function languagePairKey(sourceLanguage: string, targetLanguage: string): string {
  return `${normalizeDictionaryKey(sourceLanguage)}:${normalizeDictionaryKey(targetLanguage)}`;
}

function indexKey(value: string, sourceLanguage: string, targetLanguage: string): string {
  return `${languagePairKey(sourceLanguage, targetLanguage)}:${normalizeDictionaryKey(value)}`;
}

function addToGroupedIndex(
  index: Map<string, DictionaryEntry[]>,
  key: string,
  entry: DictionaryEntry,
): void {
  const entries = index.get(key) ?? [];
  if (!entries.some((candidate) => candidate.id === entry.id)) {
    entries.push(entry);
    index.set(key, entries);
  }
}

export class InMemoryDictionaryRepository implements DictionaryRepository {
  private readonly entriesByLanguagePair = new Map<string, DictionaryEntry[]>();
  private readonly byLemma = new Map<string, DictionaryEntry[]>();
  private readonly byPhrase = new Map<string, DictionaryEntry[]>();

  constructor(entries: DictionaryEntry[]) {
    for (const entry of entries) {
      const pairKey = languagePairKey(entry.sourceLanguage, entry.targetLanguage);
      const pairEntries = this.entriesByLanguagePair.get(pairKey) ?? [];
      if (!pairEntries.some((candidate) => candidate.id === entry.id)) {
        pairEntries.push(entry);
        this.entriesByLanguagePair.set(pairKey, pairEntries);
      }

      const key = indexKey(entry.lemma, entry.sourceLanguage, entry.targetLanguage);
      if (entry.entryType === 'phrase') {
        addToGroupedIndex(this.byPhrase, key, entry);
      } else {
        addToGroupedIndex(this.byLemma, key, entry);
      }
    }
  }

  getEntries(sourceLanguage: string, targetLanguage: string): DictionaryEntry[] {
    return this.entriesByLanguagePair.get(languagePairKey(sourceLanguage, targetLanguage)) ?? [];
  }

  findByLemma(lemma: string, sourceLanguage: string, targetLanguage: string): DictionaryEntry[] {
    return this.byLemma.get(indexKey(lemma, sourceLanguage, targetLanguage)) ?? [];
  }

  findByPhrase(phrase: string, sourceLanguage: string, targetLanguage: string): DictionaryEntry[] {
    return this.byPhrase.get(indexKey(phrase, sourceLanguage, targetLanguage)) ?? [];
  }
}

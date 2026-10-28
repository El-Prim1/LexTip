export type LanguageCode = string;
export type DictionaryEntryType = 'word' | 'phrase';
export type DictionaryPartOfSpeech = string;
export const STATISTICAL_DICTIONARY_SOURCE = 'statistical-dataset';

export interface TranslationAlternative {
  id: string;
  text: string;
  probability?: number;
  count?: number;
}

export interface DictionarySense {
  id: string;
  translations: TranslationAlternative[];
  definition?: string;
  examples?: string[];
}

export interface DictionaryEntry {
  id: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  lemma: string;
  entryType: DictionaryEntryType;
  partOfSpeech: DictionaryPartOfSpeech;
  senses: DictionarySense[];
  source: string;
  verificationStatus: 'unverified' | 'verified';
}

export interface LegacyDictionaryRecord {
  word?: unknown;
  translation?: unknown;
  probability?: unknown;
  count?: unknown;
  [key: string]: unknown;
}

export interface AdaptedDictionaryResult {
  entries: DictionaryEntry[];
  skipped: Array<{ index: number; reason: string }>;
}

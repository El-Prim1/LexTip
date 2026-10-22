export type LanguageCode = string;
export type DictionaryEntryType = 'word' | 'phrase';
export type DictionaryPartOfSpeech = string;

export interface TranslationAlternative {
  id: string;
  text: string;
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
  [key: string]: unknown;
}

export interface AdaptedDictionaryResult {
  entries: DictionaryEntry[];
  skipped: Array<{ index: number; reason: string }>;
}

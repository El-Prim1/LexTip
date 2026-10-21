import type { PartOfSpeech } from 'wink-nlp';

export interface WordFormAnalysis {
  lemma: string;
  partOfSpeech: PartOfSpeech;
  features: string[];
}

const entries: Array<[string, WordFormAnalysis[]]> = [
  ['studies', [
    { lemma: 'study', partOfSpeech: 'NOUN', features: ['PLURAL'] },
    { lemma: 'study', partOfSpeech: 'VERB', features: ['PRESENT', 'THIRD_PERSON'] },
  ]],
  ['studying', [{ lemma: 'study', partOfSpeech: 'VERB', features: ['PROGRESSIVE'] }]],
  ['books', [{ lemma: 'book', partOfSpeech: 'NOUN', features: ['PLURAL'] }]],
  ['students', [{ lemma: 'student', partOfSpeech: 'NOUN', features: ['PLURAL'] }]],
  ['went', [{ lemma: 'go', partOfSpeech: 'VERB', features: ['PAST'] }]],
  ['gone', [{ lemma: 'go', partOfSpeech: 'VERB', features: ['PARTICIPLE'] }]],
  ['children', [{ lemma: 'child', partOfSpeech: 'NOUN', features: ['PLURAL'] }]],
  ['mice', [{ lemma: 'mouse', partOfSpeech: 'NOUN', features: ['PLURAL'] }]],
  ['better', [
    { lemma: 'good', partOfSpeech: 'ADJ', features: ['COMPARATIVE'] },
    { lemma: 'well', partOfSpeech: 'ADV', features: ['COMPARATIVE'] },
  ]],
  ['saw', [
    { lemma: 'see', partOfSpeech: 'VERB', features: ['PAST'] },
    { lemma: 'saw', partOfSpeech: 'NOUN', features: [] },
  ]],
  ['were', [{ lemma: 'be', partOfSpeech: 'AUX', features: ['PAST', 'PLURAL'] }]],
];

export const wordFormIndex = new Map<string, WordFormAnalysis[]>(entries);

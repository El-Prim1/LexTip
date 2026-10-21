import { analyzeText, analyzeWord } from './lemmatization.js';

interface LinguaLensNlpRuntime {
  analyzeText: typeof analyzeText;
  analyzeWord: typeof analyzeWord;
}

(globalThis as typeof globalThis & { LinguaLensNLP?: LinguaLensNlpRuntime }).LinguaLensNLP = {
  analyzeText,
  analyzeWord,
};

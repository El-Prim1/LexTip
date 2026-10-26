import { analyzeText, analyzeWord } from './lemmatization.js';

interface LexTipNlpRuntime {
  analyzeText: typeof analyzeText;
  analyzeWord: typeof analyzeWord;
}

(globalThis as typeof globalThis & { LexTipNLP?: LexTipNlpRuntime }).LexTipNLP = {
  analyzeText,
  analyzeWord,
};

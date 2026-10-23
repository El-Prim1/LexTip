import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const googleTranslateApi = require('google-translate-api');

export interface TranslationResult {
  translatedText: string;
}

export async function translateText(text: string, timeoutMs: number = 10000): Promise<TranslationResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Translation request timed out'));
    }, timeoutMs);
    timer.unref?.();
  });

  const translationExecution = async (): Promise<TranslationResult> => {
    try {
      // Primary method: google-translate-api
      const res = await googleTranslateApi(text, { to: 'ru' });
      if (res && res.text) {
        return { translatedText: res.text };
      }
    } catch {
      // Fallback for upstream token deprecation in legacy library
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Upstream translation service failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error('Malformed upstream translation response');
      }

      const translated = data[0].map((chunk: unknown[]) => chunk[0]).filter(Boolean).join('');
      return { translatedText: translated };
    }

    throw new Error('Translation returned empty result');
  };

  return Promise.race([translationExecution(), timeoutPromise]);
}


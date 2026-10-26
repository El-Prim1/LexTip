export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

const TARGET_LANGUAGE = 'ru';

export async function translateText(text: string, timeoutMs: number = 10000): Promise<TranslationResult> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.search = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: TARGET_LANGUAGE,
    dt: 't',
    q: text,
  }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream translation service failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('Malformed upstream translation response');
    }

    const translated = data[0].map((chunk: unknown[]) => chunk[0]).filter(Boolean).join('');
    if (!translated) {
      throw new Error('Translation returned empty result');
    }

    return {
      translatedText: translated,
      sourceLanguage: typeof data[2] === 'string' ? data[2] : null,
      targetLanguage: TARGET_LANGUAGE,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Translation request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

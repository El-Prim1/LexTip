import { createRequire } from 'module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const requestContext = new AsyncLocalStorage<number>();
const gotPath = require.resolve('got');
const originalGot = require('got');
const gotModule = require.cache[gotPath];
if (!gotModule) {
  throw new Error('Unable to instrument the Google Translate HTTP client');
}

function isTranslationEndpoint(request: unknown): boolean {
  try {
    const requestUrl = typeof request === 'string'
      ? request
      : (request as { href?: string; url?: string } | undefined)?.href
        ?? (request as { url?: string } | undefined)?.url;
    if (!requestUrl) return false;
    const parsedUrl = new URL(requestUrl);
    return parsedUrl.hostname === 'translate.google.com'
      && parsedUrl.pathname === '/translate_a/single';
  } catch {
    return false;
  }
}

function logUpstreamResult(
  upstream: string,
  status: number | null,
  retryAfter: string | null,
  durationMs: number,
  error?: unknown,
): void {
  const errorRecord = error && typeof error === 'object'
    ? error as { name?: unknown; message?: unknown; statusCode?: unknown }
    : undefined;
  const rawMessage = typeof errorRecord?.message === 'string' ? errorRecord.message : '';
  const errorMessage = errorRecord?.name === 'ParseError'
    ? 'Upstream response could not be parsed'
    : rawMessage
      .replace(/https?:\/\/\S+/gi, '[redacted-url]')
      .replace(/\bq=[^&\s]+/gi, 'q=[redacted]');

  console.info('[TranslationServer] Upstream translation request', {
    upstream,
    apiRequestId: requestContext.getStore() ?? null,
    status: status ?? (
      typeof errorRecord?.statusCode === 'number' ? errorRecord.statusCode : null
    ),
    errorName: typeof errorRecord?.name === 'string' ? errorRecord.name : null,
    errorMessage: errorMessage || null,
    retryAfter,
    durationMs: Number(durationMs.toFixed(2)),
  });
}

const instrumentedGot = (request: unknown, ...args: unknown[]) => {
  if (!isTranslationEndpoint(request)) {
    return originalGot(request, ...args);
  }

  const startedAt = performance.now();
  return originalGot(request, ...args).then(
    (response: { statusCode?: number; headers?: Record<string, string | undefined> }) => {
      logUpstreamResult(
        'matheuss/google-translate-api',
        typeof response.statusCode === 'number' ? response.statusCode : null,
        response.headers?.['retry-after'] ?? null,
        performance.now() - startedAt,
      );
      return response;
    },
    (error: unknown) => {
      const response = error && typeof error === 'object'
        ? (error as {
          response?: {
            statusCode?: number;
            headers?: Record<string, string | undefined>;
          };
        }).response
        : undefined;
      logUpstreamResult(
        'matheuss/google-translate-api',
        typeof response?.statusCode === 'number' ? response.statusCode : null,
        response?.headers?.['retry-after'] ?? null,
        performance.now() - startedAt,
        error,
      );
      throw error;
    },
  );
};
Object.assign(instrumentedGot, originalGot);
gotModule.exports = instrumentedGot;

const googleTranslateApi = require('google-translate-api');

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

const TARGET_LANGUAGE = 'ru';

export async function translateText(
  text: string,
  timeoutMs: number = 10000,
  apiRequestId?: number,
): Promise<TranslationResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Translation request timed out'));
    }, timeoutMs);
    timer.unref?.();
  });

  const translationExecution = async (): Promise<TranslationResult> => {
    try {
      // Primary method: google-translate-api
      const res = await googleTranslateApi(text, { to: TARGET_LANGUAGE });
      if (res && res.text) {
        return {
          translatedText: res.text,
          sourceLanguage: res.from?.language?.iso || null,
          targetLanguage: TARGET_LANGUAGE,
        };
      }
    } catch {
      // Fallback for upstream token deprecation in legacy library
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${TARGET_LANGUAGE}&dt=t&q=${encodeURIComponent(text)}`;
      const fallbackStartedAt = performance.now();
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
      } catch (error) {
        logUpstreamResult(
          'translate.googleapis.com fallback',
          null,
          null,
          performance.now() - fallbackStartedAt,
          error,
        );
        throw error;
      }
      logUpstreamResult(
        'translate.googleapis.com fallback',
        response.status,
        response.headers.get('retry-after'),
        performance.now() - fallbackStartedAt,
        response.ok ? undefined : new Error(`HTTP ${response.status} ${response.statusText}`),
      );

      if (!response.ok) {
        throw new Error(`Upstream translation service failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw new Error('Malformed upstream translation response');
      }

      const translated = data[0].map((chunk: unknown[]) => chunk[0]).filter(Boolean).join('');
      return {
        translatedText: translated,
        sourceLanguage: typeof data[2] === 'string' ? data[2] : null,
        targetLanguage: TARGET_LANGUAGE,
      };
    }

    throw new Error('Translation returned empty result');
  };

  const execute = () => Promise.race([translationExecution(), timeoutPromise]);
  return apiRequestId === undefined
    ? execute()
    : requestContext.run(apiRequestId, execute);
}

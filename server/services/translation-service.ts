/**
 * Translation Service
 * Integrates with Google Cloud Translation API v2 using API key authentication
 */

import config from '../config/index.js';

interface TranslationRequest {
  text: string;
  targetLang: string;
}

interface TranslationResponse {
  translation: string;
  sourceLang: string;
  layer: 2;
}

interface GoogleTranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage: string;
    }>;
  };
}

interface GoogleTranslateError {
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export class TranslationService {
  private apiKey: string;
  private apiUrl: string;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private requestTimeoutMs: number;

  constructor() {
    this.apiKey = config.googleTranslateApiKey;
    this.apiUrl = config.googleTranslateApiUrl;
    this.maxRetries = config.maxRetries;
    this.retryBaseDelayMs = config.retryBaseDelayMs;
    this.requestTimeoutMs = config.requestTimeoutMs;
  }

  /**
   * Translate text using Google Cloud Translation API v2
   * Includes automatic source language detection
   */
  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const { text, targetLang } = request;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Invalid input: text is required and must be non-empty');
    }

    if (!targetLang || typeof targetLang !== 'string') {
      throw new Error('Invalid input: targetLang is required');
    }

    return this.translateWithRetry(text, targetLang);
  }

  private async translateWithRetry(
    text: string,
    targetLang: string,
    attempt: number = 0
  ): Promise<TranslationResponse> {
    try {
      return await this.fetchTranslation(text, targetLang);
    } catch (error) {
      const isTransient = this.isTransientError(error);
      const shouldRetry = isTransient && attempt < this.maxRetries;

      if (shouldRetry) {
        const delay = this.calculateBackoff(attempt);
        console.warn(`[TranslationService] Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
        await this.sleep(delay);
        return this.translateWithRetry(text, targetLang, attempt + 1);
      }

      throw error;
    }
  }

  private async fetchTranslation(text: string, targetLang: string): Promise<TranslationResponse> {
    const url = new URL(this.apiUrl);
    url.searchParams.append('key', this.apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          target: targetLang,
          format: 'text',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData: GoogleTranslateError = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        throw new Error(`Google Translation API error (${response.status}): ${errorMessage}`);
      }

      const data: GoogleTranslateResponse = await response.json();

      if (!data.data?.translations?.[0]) {
        throw new Error('Invalid response from Google Translation API');
      }

      const translation = data.data.translations[0];
      return {
        translation: translation.translatedText,
        sourceLang: translation.detectedSourceLanguage,
        layer: 2,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Translation request timed out');
      }

      throw error;
    }
  }

  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    // 429: Rate limit exceeded
    if (message.includes('429') || message.includes('rate limit')) {
      return true;
    }

    // 500: Internal server error
    if (message.includes('500') || message.includes('internal server error')) {
      return true;
    }

    // 503: Service unavailable
    if (message.includes('503') || message.includes('service unavailable')) {
      return true;
    }

    // Network errors
    if (message.includes('network') || message.includes('fetch failed') || message.includes('econnrefused')) {
      return true;
    }

    return false;
  }

  private calculateBackoff(attempt: number): number {
    return this.retryBaseDelayMs * Math.pow(2, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default TranslationService;

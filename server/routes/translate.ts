import { Router, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import { translateText } from '../services/translation-service';

export const translateRouter = Router();
let apiRequestSequence = 0;

translateRouter.post('/translate', async (req: Request, res: Response): Promise<void> => {
  const apiRequestId = ++apiRequestSequence;
  const startedAt = performance.now();
  console.info('[TranslationServer] API translation request received', { apiRequestId });
  const { text } = req.body || {};

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Text field is required and must be a non-empty string.' });
    return;
  }

  if (text.length > 500) {
    res.status(400).json({ error: 'Text length exceeds the maximum allowed limit of 500 characters.' });
    return;
  }

  try {
    const result = await translateText(text.trim(), 10000, apiRequestId);
    console.info('[TranslationServer] API translation request completed', {
      apiRequestId,
      status: 200,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    });
    res.status(200).json({
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Translation processing failed';
    if (message.includes('timed out')) {
      res.status(504).json({ error: 'Translation request timed out.' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

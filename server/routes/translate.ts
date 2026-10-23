/**
 * Translation Route
 * Handles POST /api/translate requests
 */

import { Router, Request, Response } from 'express';
import TranslationService from '../services/translation-service.js';

const router = Router();
const translationService = new TranslationService();

interface TranslateRequestBody {
  text: string;
  targetLang: string;
}

router.post('/translate', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { text, targetLang } = req.body as TranslateRequestBody;

  try {
    const result = await translationService.translate({ text, targetLang });
    const latencyMs = Date.now() - startTime;

    // Log without exposing user text or full URL
    console.log(`[Translate] Request completed - status: 200, latency: ${latencyMs}ms, sourceLang: ${result.sourceLang}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[Translate] Request failed - latency: ${latencyMs}ms, error: ${errorMessage}`);

    // Determine appropriate status code
    let statusCode = 500;
    if (errorMessage.includes('timeout')) {
      statusCode = 504;
    } else if (errorMessage.includes('400') || errorMessage.includes('Invalid input')) {
      statusCode = 400;
    } else if (errorMessage.includes('403') || errorMessage.includes('quota')) {
      statusCode = 403;
    } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      statusCode = 429;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
    });
  }
});

export default router;

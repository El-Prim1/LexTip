/**
 * Request Validation Middleware
 * Validates translation request payloads and enforces input limits
 */

import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';

interface TranslationRequestBody {
  text: string;
  targetLang?: string;
}

export function validateTranslationRequest(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as TranslationRequestBody;

  // Check if body exists
  if (!body || typeof body !== 'object') {
    res.status(400).json({
      error: 'Invalid request body',
    });
    return;
  }

  // Validate text field
  if (!body.text || typeof body.text !== 'string') {
    res.status(400).json({
      error: 'text field is required and must be a string',
    });
    return;
  }

  // Trim and check for empty string
  const trimmedText = body.text.trim();
  if (trimmedText.length === 0) {
    res.status(400).json({
      error: 'text field cannot be empty',
    });
    return;
  }

  // Enforce maximum length
  if (trimmedText.length > config.maxInputLength) {
    res.status(400).json({
      error: `text exceeds maximum length of ${config.maxInputLength} characters`,
    });
    return;
  }

  // Validate targetLang (optional, defaults to 'ru')
  if (body.targetLang !== undefined && typeof body.targetLang !== 'string') {
    res.status(400).json({
      error: 'targetLang must be a string if provided',
    });
    return;
  }

  // Sanitize body
  req.body = {
    text: trimmedText,
    targetLang: body.targetLang || 'ru',
  };

  next();
}

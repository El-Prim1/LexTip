/**
 * LinguaLens - Background Service Worker (Manifest v3)
 * Handles message routing between content scripts and translation/AI pipelines.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinguaLens] Extension successfully installed.');
});

// Message listener for translation requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_REQUEST') {
    const { text } = message.payload;
    
    // Phase 1 simulation response (will be replaced by Layer 1/2 in Phase 2 & 3)
    const mockTranslations = {
      handles: 'обрабатывает',
      state: 'состояние',
      management: 'управление',
      polysemy: 'полисемия',
      linguistics: 'лингвистика',
      shadow: 'тень / изолированный DOM',
      isolated: 'изолированный',
      extension: 'расширение',
      mutation: 'мутация узла',
      viewport: 'область экрана',
      fixed: 'фиксированное позиционирование',
    };

    const translation = mockTranslations[text.trim().toLowerCase()] || `перевод: ${text}`;
    
    sendResponse({
      success: true,
      data: {
        translation,
        layer: 1,
        latencyMs: 1,
      },
    });
  } else if (message.type === 'AI_EXPLAIN_REQUEST') {
    sendResponse({
      success: true,
      data: {
        explanation: 'Deep linguistic analysis (Layer 3) will be handled via Gemini 2.5 Flash API.',
      },
    });
  }
  return true;
});

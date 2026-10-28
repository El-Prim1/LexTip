'use strict';

const LEXTIP_TRANSLATION_PAGE = 'experiments/local-translation/offscreen.html';
const LEXTIP_TRANSLATION_URL = chrome.runtime.getURL(LEXTIP_TRANSLATION_PAGE);
let lextipOffscreenCreation;

async function ensureLexTipTranslationDocument() {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [LEXTIP_TRANSLATION_URL],
    });
    if (contexts.length > 0) return;
  } else {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    if (clients.some((client) => client.url === LEXTIP_TRANSLATION_URL)) return;
  }

  if (!lextipOffscreenCreation) {
    lextipOffscreenCreation = chrome.offscreen.createDocument({
      url: LEXTIP_TRANSLATION_PAGE,
      reasons: ['WORKERS'],
      justification: 'Run the local translation prototype with ONNX Runtime Web workers.',
    }).finally(() => {
      lextipOffscreenCreation = null;
    });
  }
  await lextipOffscreenCreation;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'LEXTIP_STAGE3_TRANSLATE') return false;

  const text = message.payload?.text;
  if (typeof text !== 'string' || !text.trim()) {
    sendResponse({ success: false, error: 'Enter English text to translate.' });
    return false;
  }

  ensureLexTipTranslationDocument()
    .then(() =>
      chrome.runtime.sendMessage({
        type: 'LEXTIP_STAGE3_OFFSCREEN_TRANSLATE',
        payload: { text },
      }),
    )
    .then((response) => {
      if (!response || typeof response.success !== 'boolean') {
        throw new Error('The offscreen translation document did not respond.');
      }
      sendResponse(response);
    })
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ success: false, error: messageText });
    });

  return true;
});

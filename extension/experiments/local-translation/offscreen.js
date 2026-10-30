'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'LEXTIP_STAGE3_OFFSCREEN_TRANSLATE') return false;

  const runtime = globalThis.LexTipStage3Translation;
  if (!runtime) {
    sendResponse({ success: false, error: 'The packaged translation runtime did not load.' });
    return false;
  }

  runtime.translate(message.payload.text, (progress) => {
    chrome.runtime.sendMessage({
      type: 'LEXTIP_STAGE3_PROGRESS',
      payload: progress,
    });
  }).then((result) => {
    sendResponse({ success: true, data: result });
  }).catch((error) => {
    const messageText = error instanceof Error ? error.message : String(error);
    sendResponse({ success: false, error: messageText });
  });

  return true;
});

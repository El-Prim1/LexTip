# LexTip

LexTip is a private browser-translation project focused on making selected text easy to understand without interrupting the page. Its Chromium extension translates text into Russian and presents the result in a compact, expandable popup.

## Project overview

- **In-page translation:** Selecting text opens an isolated popup showing the original text, its translation, and readable source and target language names when available.
- **Three-layer translation pipeline:** The extension checks its local dictionary first, then its browser translation cache, and finally requests a translation from the backend.
- **Language processing:** Local dictionary lookup uses normalization and NLP-based lemmatization to improve word-form matching.
- **Translation backend:** An Express API provides translation and detected-language metadata to the extension.
- **Web interface:** A Vite and React interface provides a companion translation experience and project testbench.

## High-level architecture

1. The **extension content script** detects selected text and displays the popup in an isolated Shadow DOM.
2. The **extension service worker** coordinates dictionary lookup, cached results, and backend requests.
3. The **backend API** translates text not resolved by the local layers and returns translation and language metadata.
4. The **dictionary and cache** help resolve repeated or common translations without a backend request.

The browser extension is located in `extension/`, the web interface in `src/`, and the translation API in `server/`.

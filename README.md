# LexTip

LexTip is a Chromium browser extension and companion web app for looking up selected text with an English-Russian dictionary and linguistic analysis.

## Project overview

- The extension uses a local dictionary and NLP-based lemmatization to resolve word forms.
- The improved popup layout presents lookup results in a compact, expandable view.
- The Vite and React web interface provides the companion app and testbench.

## Run locally

1. Install dependencies with `npm install`.
2. Set `GEMINI_API_KEY` in `.env.local` when using Gemini-backed app features.
3. Start the app with `npm run dev`.

The browser extension is in `extension/`, and the web interface is in `src/`.
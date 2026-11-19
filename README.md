# LexTip

LexTip is a Chromium Manifest V3 extension for English-to-Russian lookup of selected text, backed by a local dictionary and NLP-based lemmatization.

The extension is in `extension/`. Dictionary and NLP source modules are in `src/`; build and test scripts are in `scripts/` and `tests/`.

Translation runs in three tiers: the local English-to-Russian dictionary and NLP
lemmatization first, then the browser cache, then a self-hosted LibreTranslate
backend. Configure the backend base URL in
`extension/config/libtretranslate.config.js`. The standalone LibreTranslate
deployment project is in `lex-tip-backend/`, and the migration details are in
`LIBRETRANSLATE-MIGRATION.md`.

Install dependencies with `npm install`. Available development, build, and test commands are listed in `package.json`.

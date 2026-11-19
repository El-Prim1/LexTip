# LexTip → LibreTranslate migration report

Status: **preparation complete**. Nothing was deployed, no accounts were
created, and no credentials were requested or stored.

## 1. Backend project structure

A standalone deployment repository was created at `lex-tip-backend/`. It has no
dependency on the extension source and can be uploaded to its own GitHub
repository as-is.

```text
lex-tip-backend/
├── Dockerfile            # official LibreTranslate image, pinned to v1.6.0
├── render.yaml           # Render Blueprint (Docker web service, health check)
├── docker-compose.yml    # optional local run
├── .env.example          # documented environment variables
├── .gitignore            # ignores .env, logs and local data
├── .dockerignore
└── README.md             # setup, GitHub upload, Render deploy, maintenance
```

Key decisions:

- The image is pinned to `libretranslate/libretranslate:v1.6.0` for reproducible
  deployments.
- `LT_LOAD_ONLY=en,ru` keeps the image small and the boot fast.
- `LT_DISABLE_WEB_UI=true` disables the bundled demo UI; LexTip only needs the
  JSON API.
- The container binds to Render's `$PORT` (falling back to 5000 locally).
- The Render health check uses `/languages`.
- Persistent storage is documented but commented out, because Render persistent
  disks require a paid instance. Uncomment the `disk:` block and
  `LT_API_KEYS_DB_PATH` on a paid plan.
- No secrets, API keys or personal configuration are committed.

## 2. Existing integration that was replaced

The pre-migration flow was:

1. `content-script.js` asked the service worker for the local dictionary
   (`TRANSLATE_REQUEST`).
2. On a dictionary miss it checked `chrome.storage.local`.
3. On a cache miss it sent `GOOGLE_TRANSLATE_REQUEST`; the service worker called
   the undocumented `https://clients5.google.com/translate_a/t` endpoint and
   parsed its array-shaped response.

That unofficial endpoint and message type were removed. The replacement is
`LIBRETRANSLATE_REQUEST` → `{baseUrl}/translate`, plus
`LIBRETRANSLATE_LANGUAGES_REQUEST` → `{baseUrl}/languages` for discovery. The
dictionary, cache and fallback tiers keep their original order and behaviour.

## 3. Files created or modified

### Backend (new, independent)

- `lex-tip-backend/Dockerfile`
- `lex-tip-backend/render.yaml`
- `lex-tip-backend/docker-compose.yml`
- `lex-tip-backend/.env.example`
- `lex-tip-backend/.gitignore`
- `lex-tip-backend/.dockerignore`
- `lex-tip-backend/README.md`

### Extension

- `extension/config/libretranslate.config.js` — **new** deployment configuration
  file (`libretranslateBaseUrl`, optional `libretranslateApiKey`).
- `extension/background/service-worker.js` — replaced the unofficial Google
  endpoint with LibreTranslate `/translate` and `/languages` calls; added
  supported-language discovery with caching; loads the config via
  `importScripts`.
- `extension/content/content-script.js` — sends `LIBRETRANSLATE_REQUEST`,
  discovers supported languages from the backend, preserves dictionary-first
  lookup, cache, fallback and language preferences, and uses the server's
  detected language for labels.
- `extension/popup/popup.js` — populates the settings selectors from the
  backend's discovered languages (falling back to the built-in list).
- `package.json` — added `test:libretranslate` and `test:backend`, and included
  them in `npm test`.

### Tests

- `tests/libretranslate-integration.test.mjs` — controlled mocks for request
  format, auto-detection, manual source, identical language pairs, HTTP errors,
  empty translations, network errors and language caching.
- `tests/backend-deployment.test.mjs` — validates the deployment files, pinned
  image, environment example, ignore rules, README workflow and the removal of
  the unofficial Google endpoint.

### Documentation

- `LIBRETRANSLATE-MIGRATION.md` (this report).

## 4. Manual steps to deploy the backend

These steps are intentionally manual. Nothing was pushed or deployed.

### GitHub

1. Create an empty GitHub repository, for example `lextip-libretranslate`.
2. From `lex-tip-backend/`:

   ```bash
   git init
   git add .
   git commit -m "Initial LibreTranslate deployment configuration"
   git branch -M main
   git remote add origin https://github.com/<your-user>/lextip-libretranslate.git
   git push -u origin main
   ```

3. Confirm that `.env` is **not** part of the commit.

### Render

1. Open the Render dashboard and choose **New → Blueprint**.
2. Connect the GitHub repository.
3. Render reads `render.yaml` and creates a Docker web service.
4. Wait for the first build. The first boot downloads the `en` and `ru` models,
   which can take several minutes.
5. When the service is live, copy its public URL, for example
   `https://lextip-libretranslate.onrender.com`.

### Verification

```bash
curl -s https://<your-service>.onrender.com/languages
curl -s -X POST https://<your-service>.onrender.com/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"hello","source":"auto","target":"ru","format":"text"}'
```

## 5. Where the API URL comes from and how to configure the extension

The deployed API base URL is the public URL shown by Render after deployment.
It has the form `https://<service-name>.onrender.com`.

Edit `extension/config/libretranslate.config.js`:

```js
globalThis.LEXTIP_CONFIG = {
  libretranslateBaseUrl: "https://<service-name>.onrender.com",
  libretranslateApiKey: "",
};
```

- Do not add a trailing slash; the service worker trims one anyway.
- Leave `libretranslateApiKey` empty when the server allows anonymous requests.
  If you enable `LT_API_KEYS`, put the key here. Note that a key shipped inside
  a browser extension is not a real secret.
- Reload the extension after editing the config (`chrome://extensions` →
  Reload).

The extension reads the URL only from this file; no environment-specific URL is
hardcoded in the service worker or content script.

## 6. Translation flow after migration

1. **Dictionary first:** the local English→Russian dictionary and NLP
   lemmatization are unchanged. `TRANSLATE_REQUEST` still handles them.
2. **Cache:** `chrome.storage.local` entries are keyed by source and target
   language (`lextip_trans_<source>_<target>_<text>`), so pairs never collide.
3. **LibreTranslate:** `LIBRETRANSLATE_REQUEST` posts to
   `{baseUrl}/translate` with:
   ```json
   { "q": "...", "source": "auto", "target": "ru", "format": "text" }
   ```
   and reads `translatedText` plus `detectedLanguage`.
4. **Fallback:** network, HTTP, malformed or empty responses produce the existing
   `Translation not found` fallback instead of a stuck placeholder.

Supported languages are discovered from `{baseUrl}/languages` at startup and
cached for one hour. The popup and the in-page popup use the discovered list
when available and fall back to the built-in list when the server is
unreachable.

## 7. Tests performed

Command: `npm test` (includes `npm run lint` separately).

| Suite | Result |
| --- | --- |
| `tests/dictionary-integration.test.mjs` | pass |
| `tests/language-configuration.test.mjs` | pass |
| `tests/libretranslate-integration.test.mjs` | pass |
| `tests/backend-deployment.test.mjs` | pass |
| `tests/phase1-verify.mjs` | 22 passed, 0 failed |
| `tests/phase2-step2-verify.mjs` | pass |
| `tests/phase2-step4-verify.mjs` | pass |
| `tsc --noEmit` (`npm run lint`) | pass |

The LibreTranslate tests use controlled mocks; they do not contact a live
server. They cover automatic detection, manual source selection, target
forwarding, identical language pairs, unsupported-pair errors, empty
translations, network failures and language-list caching.

## 8. Remaining limitations

- Nothing was deployed. The Render service, its URL and its cold-start behaviour
  are not verified against a live instance in this environment.
- Docker is not installed in this environment, so the image was not built or
  started locally. The configuration was validated statically.
- The first Render boot downloads models; the first translation after a free-tier
  sleep is slower than subsequent ones.
- LibreTranslate language coverage depends on `LT_LOAD_ONLY` and on the Argos
  model pair actually existing. If a requested pair is unsupported, the backend
  returns an HTTP error and the extension shows the standard fallback.
- The optional API key, if enabled, is visible in the extension bundle. Treat it
  as an abuse deterrent, not a secret.
- Persistent storage is commented out for free-tier compatibility; enabling it
  requires a paid Render instance.

# LexTip LibreTranslate backend

A minimal, self-contained deployment repository for the
[LibreTranslate](https://libretranslate.com/) service used by the LexTip browser
extension.

This repository contains **only** the LibreTranslate deployment configuration.
It has no dependency on the LexTip extension source code and can be uploaded to
its own GitHub repository.

> Nothing here is deployed automatically. Follow the manual steps below to
> create the GitHub repository and the Render service yourself.

## Contents

| File | Purpose |
| --- | --- |
| `Dockerfile` | Builds from the official, version-pinned LibreTranslate image. |
| `render.yaml` | Render Blueprint: Docker web service, health check, env vars. |
| `docker-compose.yml` | Optional local run for development and smoke tests. |
| `.env.example` | Reference environment variables (copy to `.env` locally). |
| `.gitignore` | Keeps secrets, logs and local data out of Git. |
| `.dockerignore` | Keeps the build context small. |

## Configuration

LibreTranslate is configured entirely through environment variables. The
important ones are:

| Variable | Meaning | Suggested value |
| --- | --- | --- |
| `LT_LOAD_ONLY` | Comma-separated language codes to download and serve. | `en,ru` |
| `LT_DISABLE_WEB_UI` | Disable the bundled demo web UI. | `true` |
| `LT_UPDATE_MODELS` | Update Argos models on startup. | `true` |
| `LT_HOST` | Bind address inside the container. | `0.0.0.0` |
| `LT_API_KEYS` | Optional comma-separated API keys. Empty = anonymous. | empty |
| `LT_API_KEYS_DB_PATH` | Optional path for the API-key database. | `/data/api_keys.db` |

`render.yaml` already sets the first four. The commented entries show how to
enable API keys and persistent storage later.

### API keys

Anonymous access is the default and is enough for personal use. If you enable
`LT_API_KEYS`, every `/translate` request must include the key in the JSON body
as `"api_key": "<key>"`. LexTip supports an optional key in its config file (see
the extension README); note that a key shipped inside a browser extension is not
a real secret.

### Persistent storage

LibreTranslate does not need persistent storage to translate. Models are
downloaded on start, so a restart may re-download them. A persistent disk is
useful for the API-key database and to avoid repeated model downloads.

Render persistent disks require a **paid** instance type. The `disk:` block in
`render.yaml` is therefore commented out so the free plan deploy works. On a paid
plan, uncomment it, mount it at `/data`, and set `LT_API_KEYS_DB_PATH` to
`/data/api_keys.db`.

The image runs as the non-root `libretranslate` user (UID 1032), so the mounted
directory must be writable by that user. If the mount is root-owned, either
adjust ownership in a derived Dockerfile or point `LT_API_KEYS_DB_PATH` at a
location the user can write.

## Local run

With Docker:

```bash
cp .env.example .env
docker compose up
```

The API is then available at `http://localhost:5000`.

Smoke test:

```bash
curl -s http://localhost:5000/languages
curl -s -X POST http://localhost:5000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"hello","source":"auto","target":"ru","format":"text"}'
```

Expected shape:

```json
{ "translatedText": "привет", "detectedLanguage": { "confidence": 100, "language": "en" } }
```

## Upload to GitHub

The repository is ready to be uploaded as-is.

1. Create an empty repository on GitHub (for example `lextip-libretranslate`).
2. From this directory:

   ```bash
   git init
   git add .
   git commit -m "Initial LibreTranslate deployment configuration"
   git branch -M main
   git remote add origin https://github.com/<your-user>/lextip-libretranslate.git
   git push -u origin main
   ```

3. Do **not** commit `.env` or any real API keys.

## Deploy on Render

1. In the Render dashboard, choose **New → Blueprint**.
2. Connect the GitHub repository you just pushed.
3. Render reads `render.yaml` and creates a Docker web service.
4. Wait for the first build. The first boot downloads the `en` and `ru` models,
   so it can take several minutes.
5. When the service is live, Render shows a public URL such as
   `https://lextip-libretranslate.onrender.com`.

### Verify the deployment

```bash
curl -s https://<your-service>.onrender.com/languages
curl -s -X POST https://<your-service>.onrender.com/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"hello","source":"auto","target":"ru","format":"text"}'
```

`/languages` is also the Render health check path.

### Free-tier notes

- Free Render web services sleep after a period of inactivity. The first request
  after sleep is slower; this is expected.
- Persistent disks are not available on the free plan.
- If the build cannot find the image tag, confirm that
  `libretranslate/libretranslate:v1.6.0` still exists on Docker Hub, or pin a
  newer release deliberately.

## Maintenance

- **Update LibreTranslate:** change the tag in `Dockerfile` and
  `docker-compose.yml`, commit, and redeploy. Read the release notes first.
- **Add a language:** append its code to `LT_LOAD_ONLY` in `render.yaml` and
  redeploy. LexTip discovers supported languages from `/languages`.
- **Rotate API keys:** update `LT_API_KEYS` in the Render dashboard, then update
  the extension config. Never commit the key.
- **Logs:** use the Render dashboard logs. No application logs are committed.

## What this repository does not do

- It does not create GitHub repositories, Render services or accounts.
- It does not contain credentials or personal configuration.
- It does not modify the LexTip extension. The extension points at the deployed
  URL through its own config file.

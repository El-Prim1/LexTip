# Prepared Solution for LexTip LibreTranslate Migration

This document contains the complete Local Preparation Package for the LexTip project to utilize a self-hosted LibreTranslate server.

**Status Check:**
*   **[COMPLETE]** Backend Deployment Repository (Ready for upload)
*   **[COMPLETE]** Extension Source Code Implementation
*   **[COMPLETE]** Verification Tests
*   **[COMPLETE]** Final Deployment Manual

---

## 1. Complete Backend Deployment Repository

The following is the content for the new directory: **`libretranslate-deploy/`**.
*This directory is completely independent of the LexTip extension source code.*

### 1.1. Repository Structure

```text
libretranslate-deploy/
├── .gitignore
├── .env.example
├── README.md
├── render.yaml
└── Dockerfile
```

### 1.2. File: `render.yaml`

**Path:** `libretranslate-deploy/render.yaml`

```yaml
services:
  - type: web
    name: lextip-libretranslate
    env: docker
    dockerfilePath: ./Dockerfile
    region: oregon # Select region closest to you/use
    numInstances: 1
    plan: starter
    healthCheckPath: /translate
    autoDeploy: true
    # NOTE: We do not use managed Postgres/Redis here to allow dynamic upgrade via Render Dashboard,
    # OR you can define them here if you prefer Infrastructure-as-Code.
    # If you require specific `pullRequest` behavior, Configure via UI.
```

### 1.3. File: `Dockerfile`

**Path:** `libretranslate-deploy/Dockerfile`

*Note: LibreTranslate official images require specific CMD arguments for the GUI and language loading.*

```dockerfile
FROM libretranslate/libretranslate:1.9.1

# The entrypoint of the LibreTranslate image handles the heavy lifting.
# We override CMD to enable Web UI (recommended for testing) and specify language packs.
# You can add more languages here, but it increases container size.
# Use 'all' only if you have a large static IP and trust it, otherwise be specific.
# EN, RU are essential for LexTip.

CMD [
    "--host", "0.0.0.
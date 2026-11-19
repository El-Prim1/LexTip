# Official LibreTranslate image, pinned so deployments are reproducible.
# Tag verified on Docker Hub: libretranslate/libretranslate:v1.6.0
FROM libretranslate/libretranslate:v1.6.0

ENV LT_HOST=0.0.0.0
ENV LT_DISABLE_WEB_UI=true

# The upstream image ships an ENTRYPOINT that hard-codes `--host *` and does
# not read Render's dynamic PORT. Reset it and start LibreTranslate ourselves.
ENTRYPOINT []

# Render injects PORT and expects the process to bind to it. LibreTranslate
# defaults to 5000 locally, so fall back to that when PORT is not set.
CMD ["sh", "-c", "exec ./venv/bin/libretranslate --host \"${LT_HOST:-0.0.0.0}\" --port \"${PORT:-5000}\""]

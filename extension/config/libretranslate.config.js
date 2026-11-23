/**
 * LexTip deployment configuration.
 *
 * Change these values after deploying your own LibreTranslate backend.
 * Keep environment-specific settings here, not in the extension logic.
 *
 * `libretranslateBaseUrl` must be the public base URL of the LibreTranslate
 * server, without a trailing slash (for example:
 * "https://lextip-libretranslate.onrender.com").
 *
 * `libretranslateApiKey` is optional. Leave it empty when the server allows
 * anonymous requests. A key embedded in a browser extension is not secret.
 */
globalThis.LEXTIP_CONFIG = {
  libretranslateBaseUrl: "https://lextip-libretranslate.onrender.com",
  libretranslateApiKey: "",
};
